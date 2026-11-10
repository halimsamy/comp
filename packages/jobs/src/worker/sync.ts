import type { BossLike } from '../boss';
import { toQueueSettings } from '../options';
import type { TaskDefinition } from '../task';

export function queuePolicy(definition: TaskDefinition): 'singleton' | 'standard' {
  // concurrencyLimit 1 must hold across worker replicas, which only a pg-boss policy guarantees.
  return definition.queue?.concurrencyLimit === 1 ? 'singleton' : 'standard';
}

/**
 * Per-process poller concurrency. Singleton queues enforce their one-active-job-per-concurrencyKey
 * limit in pg-boss, so the poller must allow more than one to run different keys in parallel.
 */
export function loopConcurrency(params: { definition: TaskDefinition; defaultConcurrency: number }) {
  const { definition, defaultConcurrency } = params;
  if (queuePolicy(definition) === 'singleton') return defaultConcurrency;
  return definition.queue?.concurrencyLimit ?? defaultConcurrency;
}

/** Creates each task's queue and applies retry/expiry settings (also to pre-existing queues). */
export async function syncQueues(params: { boss: BossLike; definitions: TaskDefinition[] }) {
  for (const definition of params.definitions) {
    const settings = toQueueSettings(definition);
    const policy = queuePolicy(definition);
    await params.boss.createQueue(definition.id, { ...settings, policy });
    // updateQueue does not accept retryDelayMax/policy; those only apply on creation.
    const { retryDelayMax: _ignored, ...updatable } = settings;
    await params.boss.updateQueue(definition.id, updatable);
    const existing = await params.boss.getQueue(definition.id);
    if (existing?.policy && existing.policy !== policy) {
      // A standard queue would silently drop the one-at-a-time guarantee, so refuse to start.
      if (policy === 'singleton') {
        throw new Error(
          `[jobs] queue ${definition.id} has policy "${existing.policy}" but the task needs "singleton". ` +
            'Drain and delete the queue so the worker can recreate it.',
        );
      }
      console.warn(
        `[jobs] queue ${definition.id} has policy "${existing.policy}" but the task wants "${policy}". ` +
          'Policies cannot be changed in place; drain and delete the queue to apply it.',
      );
    }
  }
}

/**
 * Registers cron schedules under this worker's key and removes this worker's
 * schedules whose task no longer exists. Other workers' schedules are untouched.
 */
export async function syncSchedules(params: {
  boss: BossLike;
  definitions: TaskDefinition[];
  workerName: string;
}) {
  const { boss, definitions, workerName } = params;
  const scheduled = definitions.filter((definition) => definition.kind === 'schedule');
  for (const definition of scheduled) {
    if (!definition.cron) throw new Error(`Scheduled task ${definition.id} has no cron`);
    await boss.schedule(definition.id, definition.cron, { schedule: true }, { tz: 'UTC', key: workerName });
  }
  const wanted = new Set(scheduled.map((definition) => definition.id));
  for (const schedule of await boss.getSchedules()) {
    if (schedule.key !== workerName || wanted.has(schedule.name)) continue;
    await boss.unschedule(schedule.name, schedule.key);
    console.info(`[jobs] removed stale schedule ${schedule.name}`);
  }
}
