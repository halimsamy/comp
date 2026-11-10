import { resolveSslConfig } from '@trycompai/db/ssl-config';

export interface JobAttempt {
  id: string;
  retryCount: number;
}

/** The pg-boss job shape we read (fetch with includeMetadata: true). */
export interface BossJob extends JobAttempt {
  name: string;
  data: unknown;
  retryLimit: number;
  /** Copied onto the job row at send time, so it can differ from the current task definition. */
  expireInSeconds: number;
  createdOn: Date;
}

export interface SqlExecutor {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** The subset of PgBoss this package uses. Tests inject a fake through configureJobs. */
export interface BossLike {
  start(): Promise<unknown>;
  stop(options?: { graceful?: boolean; timeout?: number; close?: boolean }): Promise<void>;
  send(name: string, data: object, options?: object): Promise<string | null>;
  fetch(name: string, options: { batchSize: number; includeMetadata: true }): Promise<BossJob[]>;
  complete(name: string, id: JobAttempt, data?: object | null): Promise<unknown>;
  fail(name: string, id: JobAttempt, data?: object | null): Promise<unknown>;
  cancel(name: string, id: string): Promise<unknown>;
  createQueue(name: string, options?: object): Promise<void>;
  updateQueue(name: string, options?: object): Promise<void>;
  getQueue(name: string): Promise<{ policy?: string } | null>;
  schedule(name: string, cron: string, data?: object | null, options?: object): Promise<void>;
  unschedule(name: string, key?: string): Promise<void>;
  getSchedules(): Promise<Array<{ name: string; key: string }>>;
  getDb(): SqlExecutor;
}

export type JobsRole = 'producer' | 'worker';

interface JobsState {
  role: JobsRole;
  createBoss?: () => Promise<BossLike>;
  boss?: Promise<BossLike>;
}

// globalThis so Next.js HMR and duplicated CJS bundles share one connection.
const STATE_KEY = Symbol.for('@trycompai/jobs/state');
const globalState = globalThis as typeof globalThis & { [STATE_KEY]?: JobsState };
const state: JobsState = (globalState[STATE_KEY] ??= { role: 'producer' });

/** Call before the first job API use. Workers pass role 'worker' (enables cron + maintenance). */
export function configureJobs(options: { role?: JobsRole; createBoss?: () => Promise<BossLike> }) {
  if (options.role) state.role = options.role;
  if (options.createBoss) state.createBoss = options.createBoss;
  state.boss = undefined;
}

export function getJobsRole(): JobsRole {
  return state.role;
}

export function jobsSchema(): string {
  const schema = process.env.JOBS_SCHEMA ?? 'pgboss';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid JOBS_SCHEMA "${schema}"`);
  return schema;
}

function stripSslMode(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}

async function createPgBoss(): Promise<BossLike> {
  const connectionString = process.env.JOBS_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for @trycompai/jobs');
  const ssl = resolveSslConfig(connectionString);
  const isWorker = state.role === 'worker';
  const { PgBoss } = await import('pg-boss');
  const boss = new PgBoss({
    connectionString: ssl ? stripSslMode(connectionString) : connectionString,
    ssl,
    schema: jobsSchema(),
    application_name: `comp-jobs-${state.role}`,
    max: Number(process.env.JOBS_DB_POOL_MAX ?? (isWorker ? 10 : 3)),
    // Producers (API, Next.js) only enqueue; cron + maintenance run in workers.
    supervise: isWorker,
    schedule: isWorker,
  });
  boss.on('error', (error) => console.error('[jobs] pg-boss error', error));
  await boss.start();
  return boss;
}

export function getBoss(): Promise<BossLike> {
  if (!state.boss) {
    const created = (state.createBoss ?? createPgBoss)();
    // Don't cache a failed connection attempt; the next call retries.
    created.catch(() => {
      if (state.boss === created) state.boss = undefined;
    });
    state.boss = created;
  }
  return state.boss;
}

export async function stopBoss(options?: { graceful?: boolean; timeout?: number }) {
  const pending = state.boss;
  state.boss = undefined;
  if (pending) await (await pending).stop({ ...options, close: true });
}

export async function sql<T>(text: string, values: unknown[] = []): Promise<T[]> {
  const boss = await getBoss();
  const result = await boss.getDb().executeSql(text, values);
  return result.rows as T[];
}
