import { beforeEach, describe, expect, it } from 'bun:test';
import { runWithContext, type ActiveRun } from '../context';
import { runs } from '../runs';
import { schemaTask, task } from '../task';
import { idempotencyKeys, SubtaskUnwrapError, tasks } from '../trigger';
import { installFakeBoss } from './fake-boss';
import { z } from 'zod';

let fake: ReturnType<typeof installFakeBoss>;
beforeEach(() => {
  fake = installFakeBoss();
});

const parentRun = (overrides: Partial<ActiveRun> = {}): ActiveRun => ({
  runId: 'jrun_parent', taskId: 'parent', parentRunId: null, rootRunId: null, attempt: 1, tags: [], metadata: {},
  ...overrides,
});

describe('tasks.trigger', () => {
  it('records a JobRun and enqueues { runId, payload } on the task queue', async () => {
    const handle = await tasks.trigger('send-email', { organizationId: 'org_1', to: 'a@b.c' }, {
      tags: ['org_1', 'email'],
      delay: '5m',
      maxAttempts: 2,
    });
    expect(handle).toEqual({ id: 'jrun_1', taskIdentifier: 'send-email' });
    const row = fake.db.rows.get('jrun_1')!;
    expect(row).toMatchObject({ taskId: 'send-email', status: 'DELAYED', organizationId: 'org_1', tags: ['org_1', 'email'], bossJobId: 'job-1' });
    const [name, data, options] = fake.boss.send.mock.calls[0]!;
    expect(name).toBe('send-email');
    expect(data).toEqual({ runId: 'jrun_1', payload: { organizationId: 'org_1', to: 'a@b.c' } });
    expect(options).toMatchObject({ retryLimit: 1 });
    expect((options as { startAfter: Date }).startAfter).toBeInstanceOf(Date);
  });

  it('fails loudly instead of creating a default queue when no worker created it yet', async () => {
    fake.boss.send.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Queue x does not exist'), { code: 'PGBOSS_QUEUE_NOT_FOUND' });
    });
    await expect(tasks.trigger('new-task', {})).rejects.toThrow('Queue for task "new-task" does not exist yet');
    expect(fake.boss.createQueue).not.toHaveBeenCalled();
    expect(fake.db.rows.get('jrun_1')!.status).toBe('SYSTEM_FAILURE');
  });

  it('lets a retry with the same idempotency key enqueue again after a failed enqueue', async () => {
    fake.boss.send.mockImplementationOnce(async () => {
      throw new Error('db blip');
    });
    const options = { idempotencyKey: 'trust-access-email:jrun_x', idempotencyKeyTTL: '7d' };
    await expect(tasks.trigger('send-email', {}, options)).rejects.toThrow('db blip');
    const retry = await tasks.trigger('send-email', {}, options);
    expect(retry.id).not.toBe('jrun_1');
    expect(fake.db.rows.get(retry.id)!.status).toBe('QUEUED');
    expect(fake.boss.send).toHaveBeenCalledTimes(2);
  });

  it('passes concurrencyKey to pg-boss as the singleton key', async () => {
    await tasks.trigger('export-organization-evidence', {}, { concurrencyKey: 'org_1' });
    expect(fake.boss.send.mock.calls[0]![2]).toMatchObject({ singletonKey: 'org_1' });
  });

  it('marks the run SYSTEM_FAILURE and rethrows when enqueueing fails', async () => {
    fake.boss.send.mockImplementationOnce(async () => {
      throw new Error('db down');
    });
    await expect(tasks.trigger('x', {})).rejects.toThrow('db down');
    expect(fake.db.rows.get('jrun_1')!.status).toBe('SYSTEM_FAILURE');
  });

  it('links runs triggered inside a run to their parent and root', async () => {
    await runWithContext(parentRun({ rootRunId: 'jrun_root' }), () => tasks.trigger('child', {}));
    expect(fake.db.rows.get('jrun_1')).toMatchObject({ parentRunId: 'jrun_parent', rootRunId: 'jrun_root' });
  });
});

describe('idempotency', () => {
  it('returns the existing run for the same task + key instead of enqueueing again', async () => {
    const key = await idempotencyKeys.create('notice-1', { scope: 'global' });
    const first = await tasks.trigger('send-email', {}, { idempotencyKey: key, idempotencyKeyTTL: '7d' });
    const second = await tasks.trigger('send-email', {}, { idempotencyKey: key, idempotencyKeyTTL: '7d' });
    expect(second.id).toBe(first.id);
    expect(fake.boss.send).toHaveBeenCalledTimes(1);
  });

  it('re-runs once the key TTL has passed', async () => {
    const first = await tasks.trigger('t', {}, { idempotencyKey: 'k' });
    fake.db.rows.get(first.id)!.idempotencyKeyExpiresAt = new Date(Date.now() - 1000);
    const second = await tasks.trigger('t', {}, { idempotencyKey: 'k' });
    expect(second.id).not.toBe(first.id);
  });

  it('scopes keys to the current run by default and globally on request', async () => {
    const global = await idempotencyKeys.create('k', { scope: 'global' });
    const outside = await idempotencyKeys.create('k');
    const inRun = await runWithContext(parentRun(), () => idempotencyKeys.create('k'));
    const inOtherRun = await runWithContext(parentRun({ runId: 'jrun_other' }), () => idempotencyKeys.create('k'));
    expect(outside).toBe(global);
    expect(inRun).not.toBe(global);
    expect(inRun).not.toBe(inOtherRun);
    expect(global.startsWith('idk_')).toBe(true);
  });
});

describe('triggerAndWait', () => {
  const finishSoon = (status: string, patch: Record<string, unknown>) =>
    setTimeout(() => Object.assign(fake.db.rows.get('jrun_1')!, { status, ...patch }), 20);

  it('resolves { ok: true, output } when the child completes', async () => {
    const child = task({ id: 'child', run: async (p: { n: number }) => ({ doubled: p.n * 2 }) });
    finishSoon('COMPLETED', { output: { doubled: 4 } });
    const result = await child.triggerAndWait({ n: 2 });
    expect(result).toEqual({ ok: true, id: 'jrun_1', taskIdentifier: 'child', output: { doubled: 4 } });
    expect(await Promise.resolve(result.ok && result.output.doubled)).toBe(4);
  });

  it('resolves { ok: false, error } on failure and unwrap() throws', async () => {
    finishSoon('FAILED', { error: { message: 'boom' } });
    const promise = tasks.triggerAndWait('child', {});
    await expect(promise.unwrap()).rejects.toBeInstanceOf(SubtaskUnwrapError);
    expect(await promise).toEqual({ ok: false, id: 'jrun_1', taskIdentifier: 'child', error: { message: 'boom' } });
  });

  it('batchTriggerAndWait returns one result per item in order', async () => {
    const child = schemaTask({ id: 'c', schema: z.object({ i: z.number() }), run: async ({ i }) => i });
    setTimeout(() => {
      Object.assign(fake.db.rows.get('jrun_1')!, { status: 'COMPLETED', output: 1 });
      Object.assign(fake.db.rows.get('jrun_2')!, { status: 'CRASHED' });
    }, 20);
    const batch = await child.batchTriggerAndWait([{ payload: { i: 1 } }, { payload: { i: 2 } }]);
    expect(batch.runs.map((r) => r.ok)).toEqual([true, false]);
    expect(batch.id.startsWith('batch_')).toBe(true);
  });
});

describe('runs', () => {
  it('retrieve maps the row with trigger.dev style flags', async () => {
    const { id } = await tasks.trigger('t', { orgId: 'org_9' });
    Object.assign(fake.db.rows.get(id)!, { status: 'COMPLETED', output: { url: 'x' } });
    const run = await runs.retrieve<{ url: string }>(id);
    expect(run).toMatchObject({ id, taskIdentifier: 't', status: 'COMPLETED', output: { url: 'x' }, isCompleted: true, isSuccess: true, organizationId: 'org_9' });
    await expect(runs.retrieve('missing')).rejects.toThrow('not found');
  });

  it('cancel marks the run CANCELED and cancels the pg-boss job', async () => {
    const { id } = await tasks.trigger('t', {});
    await runs.cancel(id);
    expect(fake.db.rows.get(id)!.status).toBe('CANCELED');
    expect(fake.boss.cancel).toHaveBeenCalledWith('t', 'job-1');
  });
});
