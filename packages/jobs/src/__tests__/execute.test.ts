import { beforeEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { logger } from '../logger';
import { metadata } from '../metadata';
import { getTaskDefinition, schedules, schemaTask, task } from '../task';
import { tasks } from '../trigger';
import { executeJob } from '../worker/execute';
import { fakeJob, installFakeBoss } from './fake-boss';

let fake: ReturnType<typeof installFakeBoss>;
beforeEach(() => {
  fake = installFakeBoss();
});

async function runOnce(params: { handle: unknown; payload: unknown; retryCount?: number; retryLimit?: number }) {
  const definition = getTaskDefinition(params.handle)!;
  const { id } = await tasks.trigger(definition.id, params.payload);
  const job = fakeJob({ data: { runId: id, payload: params.payload }, retryCount: params.retryCount ?? 0, retryLimit: params.retryLimit ?? 2 });
  const outcome = await executeJob({ definition, job });
  return { outcome, row: fake.db.rows.get(id)! };
}

describe('executeJob', () => {
  it('runs the task in context and stores output + metadata', async () => {
    const handle = task({
      id: 'ok',
      run: async (payload: { n: number }, { ctx }) => {
        metadata.set('seen', ctx.run.id);
        logger.info('running', { n: payload.n });
        return { n: payload.n, attempt: ctx.attempt.number };
      },
    });
    const { outcome, row } = await runOnce({ handle, payload: { n: 3 } });
    expect(outcome).toEqual({ kind: 'complete' });
    expect(row).toMatchObject({ status: 'COMPLETED', output: { n: 3, attempt: 1 }, attempt: 1 });
    expect(fake.db.metadataOps[0]).toMatchObject({ runId: row.id, key: 'seen', value: row.id });
  });

  it('requeues on a retryable failure and fails terminally on the last attempt', async () => {
    const handle = task({ id: 'bad', run: async () => { throw new Error('nope'); } });
    const first = await runOnce({ handle, payload: {}, retryCount: 0, retryLimit: 2 });
    expect(first.outcome).toEqual({ kind: 'fail', error: { message: 'nope', name: 'Error' } });
    expect(first.row.status).toBe('QUEUED');
    const last = await runOnce({ handle, payload: {}, retryCount: 2, retryLimit: 2 });
    expect(last.row).toMatchObject({ status: 'FAILED', error: { message: 'nope' } });
  });

  it('validates schemaTask payloads', async () => {
    const handle = schemaTask({ id: 's', schema: z.object({ id: z.string() }), run: async ({ id }) => id });
    const { row } = await runOnce({ handle, payload: { id: 1 }, retryLimit: 0 });
    expect(row.status).toBe('FAILED');
  });

  it('times out at maxDuration without retrying', async () => {
    const handle = task({ id: 'slow', maxDuration: 0.05, run: () => new Promise(() => {}) });
    const { outcome, row } = await runOnce({ handle, payload: {} });
    expect(outcome).toEqual({ kind: 'complete' });
    expect(row.status).toBe('TIMED_OUT');
  });

  it('does not start a second copy of a run already executing at this attempt or later', async () => {
    let ran = false;
    const handle = task({ id: 'dup', run: async () => { ran = true; } });
    const definition = getTaskDefinition(handle)!;
    const { id } = await tasks.trigger('dup', {});
    Object.assign(fake.db.rows.get(id)!, { status: 'EXECUTING', attempt: 2 });
    const outcome = await executeJob({ definition, job: fakeJob({ data: { runId: id, payload: {} }, retryCount: 1 }) });
    expect(outcome).toEqual({ kind: 'complete' });
    expect(ran).toBe(false);
    // A newer attempt (pg-boss retried after a crash) still takes over.
    await executeJob({ definition, job: fakeJob({ data: { runId: id, payload: {} }, retryCount: 2 }) });
    expect(ran).toBe(true);
  });

  it('drops jobs whose run was canceled before it started', async () => {
    let ran = false;
    const handle = task({ id: 'c', run: async () => { ran = true; } });
    const definition = getTaskDefinition(handle)!;
    const { id } = await tasks.trigger('c', {});
    fake.db.rows.get(id)!.status = 'CANCELED';
    const outcome = await executeJob({ definition, job: fakeJob({ data: { runId: id, payload: {} } }) });
    expect(outcome).toEqual({ kind: 'complete' });
    expect(ran).toBe(false);
  });

  it('creates a run for cron jobs and passes a ScheduledPayload', async () => {
    let received: unknown;
    const handle = schedules.task({ id: 'cron', cron: '0 5 * * *', run: async (payload) => { received = payload; } });
    const createdOn = new Date('2026-01-01T05:00:00Z');
    const outcome = await executeJob({
      definition: getTaskDefinition(handle)!,
      job: fakeJob({ id: 'boss-1', data: { schedule: true }, createdOn }),
    });
    expect(outcome).toEqual({ kind: 'complete' });
    expect(received).toMatchObject({ timestamp: createdOn, timezone: 'UTC', scheduleId: 'cron' });
    expect([...fake.db.rows.values()][0]).toMatchObject({ taskId: 'cron', status: 'COMPLETED', bossJobId: 'boss-1' });
  });
});
