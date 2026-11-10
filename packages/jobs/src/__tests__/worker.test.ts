import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { schedules, task, queue } from '../task';
import { getTaskDefinition } from '../task';
import { findDuplicateTaskIds, loadTasks } from '../worker/load';
import { loopConcurrency, syncQueues, syncSchedules } from '../worker/sync';
import { installFakeBoss } from './fake-boss';

const taskModule = resolve(import.meta.dir, '../task.ts');

async function fixtureDir(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'jobs-load-'));
  for (const [name, source] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), source);
  }
  return dir;
}

const taskSource = (id: string) =>
  `import { task } from ${JSON.stringify(taskModule)};\nexport const t = task({ id: '${id}', run: async () => 1 });\n`;

describe('loadTasks', () => {
  it('finds exported tasks recursively and skips tests', async () => {
    const dir = await fixtureDir({
      'a.ts': taskSource('a'),
      'nested/b.ts': taskSource('b') + `export { t as again } from './b-reexport';\n`,
      'nested/b-reexport.ts': `export { t } from '../a';\n`,
      'a.spec.ts': taskSource('from-test'),
      'helpers.ts': 'export const notATask = 1;\n',
    });
    const loaded = await loadTasks({ dirs: [dir] });
    expect(loaded.map((l) => l.definition.id).sort()).toEqual(['a', 'b']);
  });

  it('rejects two different tasks with the same id', async () => {
    const dir = await fixtureDir({ 'x.ts': taskSource('dup'), 'y.ts': taskSource('dup') });
    await expect(loadTasks({ dirs: [dir] })).rejects.toThrow('Duplicate task id "dup"');
  });

  it('reports ids shared between worker manifests', () => {
    expect(findDuplicateTaskIds({ api: ['update-policy', 'a'], app: ['update-policy', 'b'] })).toEqual({
      'update-policy': ['api', 'app'],
    });
  });
});

describe('sync', () => {
  it('creates queues with mapped settings and a singleton policy for concurrencyLimit 1', async () => {
    const { boss } = installFakeBoss();
    const serial = task({ id: 'serial', queue: queue({ name: 'q', concurrencyLimit: 1 }), maxDuration: 60, run: async () => 1 });
    boss.getQueue.mockImplementation(async () => ({ policy: 'singleton' }));
    await syncQueues({ boss, definitions: [getTaskDefinition(serial)!] });
    expect(boss.createQueue.mock.calls[0]).toEqual([
      'serial',
      { retryLimit: 2, retryDelay: 1, retryBackoff: true, retryDelayMax: 10, expireInSeconds: 180, deleteAfterSeconds: 86400, policy: 'singleton' },
    ]);
    expect(boss.updateQueue.mock.calls[0]![1]).not.toHaveProperty('retryDelayMax');
  });

  it('refuses to start when a task needs a singleton queue but the queue is standard', async () => {
    const { boss } = installFakeBoss();
    const serial = task({ id: 'serial-2', queue: queue({ concurrencyLimit: 1 }), run: async () => 1 });
    await expect(syncQueues({ boss, definitions: [getTaskDefinition(serial)!] })).rejects.toThrow('needs "singleton"');
  });

  it('lets singleton queues run different concurrency keys in parallel within a process', () => {
    const serial = getTaskDefinition(task({ id: 'one', queue: queue({ concurrencyLimit: 1 }), run: async () => 1 }))!;
    const capped = getTaskDefinition(task({ id: 'five', queue: queue({ concurrencyLimit: 5 }), run: async () => 1 }))!;
    const open = getTaskDefinition(task({ id: 'open', run: async () => 1 }))!;
    expect(loopConcurrency({ definition: serial, defaultConcurrency: 10 })).toBe(10);
    expect(loopConcurrency({ definition: capped, defaultConcurrency: 10 })).toBe(5);
    expect(loopConcurrency({ definition: open, defaultConcurrency: 10 })).toBe(10);
  });

  it('registers cron schedules under the worker key and removes only its own stale ones', async () => {
    const { boss } = installFakeBoss();
    boss.getSchedules.mockImplementation(async () => [
      { name: 'cron-a', key: 'api' },
      { name: 'gone', key: 'api' },
      { name: 'app-cron', key: 'app' },
    ]);
    const cron = schedules.task({ id: 'cron-a', cron: '0 5 * * *', run: async () => 1 });
    await syncSchedules({ boss, definitions: [getTaskDefinition(cron)!], workerName: 'api' });
    expect(boss.schedule.mock.calls[0]).toEqual(['cron-a', '0 5 * * *', { schedule: true }, { tz: 'UTC', key: 'api' }]);
    expect(boss.unschedule.mock.calls).toEqual([['gone', 'api']]);
  });
});

describe('startQueueLoop', () => {
  it('fetches up to the free slots, completes successful jobs and fails errored ones', async () => {
    const { boss } = installFakeBoss();
    const { startQueueLoop } = await import('../worker/loop');
    const { tasks } = await import('../trigger');
    const handle = task({ id: 'loop', run: async (p: { fail?: boolean }) => { if (p.fail) throw new Error('x'); return 1; } });
    const ok = await tasks.trigger('loop', {});
    const bad = await tasks.trigger('loop', { fail: true });
    const jobs = [
      { id: 'j1', name: 'loop', data: { runId: ok.id, payload: {} }, retryCount: 0, retryLimit: 2, expireInSeconds: 900, createdOn: new Date() },
      { id: 'j2', name: 'loop', data: { runId: bad.id, payload: { fail: true } }, retryCount: 0, retryLimit: 2, expireInSeconds: 900, createdOn: new Date() },
    ];
    boss.fetch.mockImplementationOnce(async () => jobs).mockImplementation(async () => []);
    const controller = new AbortController();
    const loop = startQueueLoop({ boss, definition: getTaskDefinition(handle)!, concurrency: 3, pollMs: 10, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 50));
    controller.abort();
    await loop.drain(100);
    expect(boss.fetch.mock.calls[0]).toEqual(['loop', { batchSize: 3, includeMetadata: true }]);
    expect(boss.complete.mock.calls).toEqual([['loop', { id: 'j1', retryCount: 0 }, null]]);
    expect(boss.fail.mock.calls[0]![1]).toEqual({ id: 'j2', retryCount: 0 });
  });

  it('on shutdown re-queues a still-running run without spending a pg-boss attempt', async () => {
    const { boss, db } = installFakeBoss();
    const { startQueueLoop } = await import('../worker/loop');
    const { tasks } = await import('../trigger');
    const handle = task({ id: 'long', maxDuration: 3600, run: () => new Promise(() => {}) });
    const { id } = await tasks.trigger('long', {});
    const job = { id: 'job-1', name: 'long', data: { runId: id, payload: {} }, retryCount: 0, retryLimit: 0, expireInSeconds: 3720, createdOn: new Date() };
    boss.fetch.mockImplementationOnce(async () => [job]).mockImplementation(async () => []);
    const controller = new AbortController();
    const loop = startQueueLoop({ boss, definition: getTaskDefinition(handle)!, concurrency: 10, pollMs: 10, signal: controller.signal });
    await new Promise((r) => setTimeout(r, 30));
    expect(db.rows.get(id)!.status).toBe('EXECUTING');
    controller.abort();
    await loop.drain(10);
    expect(db.rows.get(id)!.status).toBe('QUEUED');
    expect(db.bossJobUpdates[0]!.values).toEqual(['long', 'job-1', 0]);
    expect(boss.fail.mock.calls[0]![1]).toEqual({ id: 'job-1', retryCount: 0 });
  });
});
