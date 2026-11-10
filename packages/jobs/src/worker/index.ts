import { configureJobs, getBoss, stopBoss } from '../boss';
import { metadata } from '../metadata';
import { sweepRuns } from '../store';
import { loadTasks } from './load';
import { startQueueLoop } from './loop';
import { loopConcurrency, queuePolicy, syncQueues, syncSchedules } from './sync';

export { findDuplicateTaskIds, loadTasks } from './load';

const envNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/**
 * A worker is a server process, so `import 'server-only'` (which throws outside the
 * react-server condition) must be a no-op, as it was in trigger.dev's bundles.
 */
function stubServerOnly() {
  globalThis.Bun?.plugin({
    name: 'jobs-server-only',
    setup(build) {
      build.module('server-only', () => ({ exports: {}, loader: 'object' }));
    },
  });
}

export interface WorkerHandle {
  taskIds: string[];
  stop(): Promise<void>;
}

/**
 * Loads every task under `dirs`, then (unless JOBS_DRY_RUN=1) creates queues,
 * syncs cron schedules and starts one poller per task queue.
 * `name` namespaces cron schedules ('api' / 'app'); task ids must be globally unique.
 */
export async function startWorker(params: {
  name: string;
  dirs: string[];
  dryRun?: boolean;
}): Promise<WorkerHandle> {
  stubServerOnly();
  // Lets shared modules detect the worker runtime (replaces TRIGGER_RUN_ID checks).
  process.env.JOBS_WORKER = '1';
  const loaded = await loadTasks({ dirs: params.dirs });
  const definitions = loaded.map((entry) => entry.definition);
  const taskIds = definitions.map((definition) => definition.id).sort();
  const defaultConcurrency = envNumber('JOBS_DEFAULT_CONCURRENCY', 10);

  if (params.dryRun ?? process.env.JOBS_DRY_RUN === '1') {
    const manifest = loaded.map(({ definition, file }) => ({
      id: definition.id,
      kind: definition.kind,
      cron: definition.cron,
      concurrency: loopConcurrency({ definition, defaultConcurrency }),
      policy: queuePolicy(definition),
      file,
    }));
    console.log(JSON.stringify({ worker: params.name, tasks: manifest }, null, 2));
    return { taskIds, stop: async () => {} };
  }

  configureJobs({ role: 'worker' });
  const boss = await getBoss();
  await syncQueues({ boss, definitions });
  await syncSchedules({ boss, definitions, workerName: params.name });

  const controller = new AbortController();
  const loops = definitions.map((definition) =>
    startQueueLoop({
      boss,
      definition,
      concurrency: loopConcurrency({ definition, defaultConcurrency }),
      pollMs: envNumber('JOBS_POLL_INTERVAL_MS', 2000),
      signal: controller.signal,
    }),
  );
  const retentionDays = envNumber('JOBS_RUN_RETENTION_DAYS', 30);
  const sweep = setInterval(
    () => sweepRuns({ retentionDays }).catch((error) => console.error('[jobs] sweep failed', error)),
    5 * 60 * 1000,
  );
  console.info(`[jobs] worker "${params.name}" started with ${taskIds.length} tasks`);

  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      controller.abort();
      clearInterval(sweep);
      const timeoutMs = envNumber('JOBS_SHUTDOWN_TIMEOUT_MS', 25000);
      await Promise.all(loops.map((loop) => loop.drain(timeoutMs)));
      await metadata.flush();
      await stopBoss({ graceful: false });
    })());

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      console.info(`[jobs] ${signal} received, draining`);
      stop()
        .catch((error) => console.error('[jobs] shutdown failed', error))
        .finally(() => process.exit(0));
    });
  }
  return { taskIds, stop };
}
