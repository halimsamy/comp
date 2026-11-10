import { mock } from 'bun:test';
import { configureJobs, type BossJob, type BossLike } from '../boss';
import type { JobRunRow } from '../store';

/** In-memory stand-in for the "JobRun" table, routed by the SQL statements store.ts issues. */
export function createFakeDb() {
  const rows = new Map<string, JobRunRow>();
  const metadataOps: Array<{ runId: string; key: string; value: unknown; sql: string }> = [];
  const bossJobUpdates: Array<{ sql: string; values: unknown[] }> = [];
  let seq = 0;
  const active = (row: JobRunRow) => ['QUEUED', 'DELAYED', 'EXECUTING'].includes(row.status);

  const execute = (text: string, values: unknown[]): unknown[] => {
    const v = values;
    if (text.startsWith('INSERT INTO "JobRun"')) {
      const [taskId, status, tags, organizationId, parentRunId, rootRunId, key, expires, meta] = v;
      const clash = [...rows.values()].find((r) => r.taskId === taskId && key && r.idempotencyKey === key);
      if (clash) throw Object.assign(new Error('duplicate key'), { code: '23505' });
      const now = new Date();
      const row: JobRunRow = {
        id: `jrun_${++seq}`, taskId: String(taskId), status: status as JobRunRow['status'],
        output: null, error: null, metadata: JSON.parse(String(meta)), tags: tags as string[],
        organizationId: (organizationId as string) ?? null, parentRunId: (parentRunId as string) ?? null,
        rootRunId: (rootRunId as string) ?? null, bossJobId: null, idempotencyKey: (key as string) ?? null,
        idempotencyKeyExpiresAt: expires ? new Date(String(expires)) : null, attempt: 0,
        createdAt: now, startedAt: null, finishedAt: null, updatedAt: now,
      };
      rows.set(row.id, row);
      return [row];
    }
    if (text.includes('"idempotencyKey" = $2')) {
      return [...rows.values()].filter((r) => r.taskId === v[0] && r.idempotencyKey === v[1]);
    }
    if (text.includes('SET "idempotencyKey" = NULL')) {
      const row = rows.get(String(v[0]));
      if (row) row.idempotencyKey = null;
      return [];
    }
    if (text.includes('SET retry_limit')) {
      bossJobUpdates.push({ sql: text, values: v });
      return [];
    }
    if (text.includes('WHERE "bossJobId" = $1')) {
      for (const r of rows.values()) {
        if (r.bossJobId === v[0] && r.status === 'EXECUTING' && r.attempt === v[1]) r.status = 'QUEUED';
      }
      return [];
    }
    if (text.includes('= ANY($1::text[])')) return (v[0] as string[]).flatMap((id) => rows.get(id) ?? []);
    if (text.startsWith('SELECT') && text.includes('WHERE "id" = $1')) return rows.has(String(v[0])) ? [rows.get(String(v[0]))] : [];
    const row = rows.get(String(v[0]));
    if (text.includes('SET "bossJobId"')) {
      if (row) row.bossJobId = String(v[1]);
      return [];
    }
    if (text.includes(`SET "status" = 'EXECUTING'`)) {
      if (!row || !active(row)) return [];
      if (row.status === 'EXECUTING' && row.attempt >= Number(v[1])) return [];
      Object.assign(row, { status: 'EXECUTING', attempt: v[1], startedAt: row.startedAt ?? new Date() });
      return [row];
    }
    if (text.includes('SET "status" = $2')) {
      if (!row || !active(row)) return [];
      Object.assign(row, {
        status: v[1], output: v[2] === null ? null : JSON.parse(String(v[2])),
        error: v[3] === null ? null : JSON.parse(String(v[3])), finishedAt: new Date(),
      });
      return [{ id: row.id }];
    }
    if (text.includes(`SET "status" = 'QUEUED'`)) {
      if (row?.status === 'EXECUTING') Object.assign(row, { status: 'QUEUED', error: JSON.parse(String(v[1])) });
      return [];
    }
    if (text.includes(`SET "status" = 'CANCELED'`)) {
      if (!row || !active(row)) return [];
      row.status = 'CANCELED';
      return [row];
    }
    if (text.includes('SET "metadata"')) {
      metadataOps.push({ runId: String(v[0]), key: String(v[1]), value: JSON.parse(String(v[2])), sql: text });
      return [];
    }
    if (text.includes('SET "tags"')) {
      if (row) row.tags = [...new Set([...row.tags, ...(v[1] as string[])])];
      return [];
    }
    if (text.includes('ORDER BY "createdAt" DESC')) return [];
    throw new Error(`Unhandled SQL in fake: ${text.slice(0, 80)}`);
  };
  return { rows, metadataOps, bossJobUpdates, execute };
}

export function installFakeBoss() {
  const db = createFakeDb();
  const executeSql = mock(async (text: string, values: unknown[] = []) => ({ rows: db.execute(text, values) }));
  let jobSeq = 0;
  const boss = {
    start: mock(async () => undefined),
    stop: mock(async () => undefined),
    send: mock(async (_name: string, _data: object, _options?: object): Promise<string | null> => `job-${++jobSeq}`),
    fetch: mock(async (_name: string, _options: object): Promise<BossJob[]> => []),
    complete: mock(async (_name: string, _id: object, _data?: object | null) => undefined),
    fail: mock(async (_name: string, _id: object, _data?: object | null) => undefined),
    cancel: mock(async (_name: string, _id: string) => undefined),
    createQueue: mock(async (_name: string, _options?: object) => undefined),
    updateQueue: mock(async (_name: string, _options?: object) => undefined),
    getQueue: mock(async (): Promise<{ policy?: string } | null> => ({ policy: 'standard' })),
    schedule: mock(async (_name: string, _cron: string, _data?: object | null, _options?: object) => undefined),
    unschedule: mock(async (_name: string, _cron: string, _data?: object | null, _options?: object) => undefined),
    getSchedules: mock(async (): Promise<Array<{ name: string; key: string }>> => []),
    getDb: () => ({ executeSql }),
  } satisfies BossLike;
  configureJobs({ role: 'producer', createBoss: async () => boss });
  return { boss, db, executeSql };
}

export function fakeJob(overrides: Partial<BossJob> & { data: unknown }): BossJob {
  return { id: 'job-x', name: 'task', retryCount: 0, retryLimit: 2, expireInSeconds: 900, createdOn: new Date(), ...overrides };
}
