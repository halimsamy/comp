/**
 * End-to-end against a THROWAWAY local Postgres (never a shared database):
 *   docker run -d --rm --name jobs-pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:16
 *   JOBS_TEST_DATABASE_URL=postgresql://postgres:pg@localhost:55432/postgres bun test src/__tests__/integration.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configureJobs, getBoss, sql } from '../boss';
import { runs } from '../runs';
import { tasks } from '../trigger';
import type { RetrievedRun } from '../types';
import { startWorker, type WorkerHandle } from '../worker';

const url = process.env.JOBS_TEST_DATABASE_URL;
const isLocal = !!url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname);
const MIGRATION = resolve(import.meta.dir, '../../../db/prisma/migrations/20261110000000_add_job_run/migration.sql');

async function waitFor(runId: string, timeoutMs = 30000): Promise<RetrievedRun> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = await runs.retrieve(runId);
    if (run.isCompleted || Date.now() > deadline) return run;
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe.skipIf(!isLocal)('pg-boss integration (local Postgres only)', () => {
  let worker: WorkerHandle;

  beforeAll(async () => {
    process.env.JOBS_DATABASE_URL = url;
    process.env.JOBS_POLL_INTERVAL_MS = '200';
    configureJobs({ role: 'worker' });
    await getBoss();
    await sql('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sql(`CREATE OR REPLACE FUNCTION generate_prefixed_cuid(prefix text) RETURNS text AS $$
      BEGIN RETURN prefix || '_' || LOWER(TO_HEX(EXTRACT(EPOCH FROM NOW())::BIGINT)) || encode(gen_random_bytes(8), 'hex'); END;
      $$ LANGUAGE plpgsql`);
    await sql('DROP TABLE IF EXISTS "JobRun"');
    await sql(await readFile(MIGRATION, 'utf8'));
    worker = await startWorker({ name: 'it', dirs: [resolve(import.meta.dir, 'fixtures')] });
  });

  afterAll(async () => {
    await worker?.stop();
  });

  it('registers queues and the cron schedule', async () => {
    expect(worker.taskIds).toEqual(['it-child', 'it-cron', 'it-flaky', 'it-parent', 'it-slow']);
    const boss = await getBoss();
    expect((await boss.getSchedules()).map((s) => [s.name, s.key])).toContainEqual(['it-cron', 'it']);
  });

  it('runs a parent that fans out with batchTriggerAndWait + triggerAndWait and aggregates child metadata', async () => {
    const handle = await tasks.trigger('it-parent', { organizationId: 'org_it' }, { tags: ['org_it'] });
    const run = await waitFor(handle.id);
    expect(run.status).toBe('COMPLETED');
    expect(run.output).toEqual({ organizationId: 'org_it', sum: 2 + 4 + 6 + 20 });
    expect(run.organizationId).toBe('org_it');
    expect(run.tags.sort()).toEqual(['fanned-out', 'org_it']);
    expect(run.metadata).toMatchObject({ phase: 'done', done: 4, child_1: 'ok', child_10: 'ok' });
    const children = await sql<{ parentRunId: string }>(`SELECT "parentRunId" FROM "JobRun" WHERE "taskId" = 'it-child'`);
    expect(children.every((c) => c.parentRunId === handle.id)).toBe(true);
  }, 40000);

  it('retries with backoff and reports the attempt count', async () => {
    const run = await waitFor((await tasks.trigger('it-flaky', { organizationId: 'org_it' })).id);
    expect(run).toMatchObject({ status: 'COMPLETED', attemptCount: 2, output: { attempt: 2 } });
  }, 40000);

  it('times out at maxDuration', async () => {
    const run = await waitFor((await tasks.trigger('it-slow', {})).id);
    expect(run.status).toBe('TIMED_OUT');
    expect(run.isFailed).toBe(true);
  }, 20000);

  it('dedupes by idempotency key and cancels delayed runs', async () => {
    const a = await tasks.trigger('it-child', { i: 1 }, { idempotencyKey: 'same', delay: '1h' });
    const b = await tasks.trigger('it-child', { i: 1 }, { idempotencyKey: 'same', delay: '1h' });
    expect(b.id).toBe(a.id);
    expect((await runs.retrieve(a.id)).status).toBe('DELAYED');
    await runs.cancel(a.id);
    expect((await runs.retrieve(a.id)).status).toBe('CANCELED');
  });
});
