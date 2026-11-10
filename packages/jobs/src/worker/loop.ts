import type { BossJob, BossLike } from '../boss';
import { releaseForShutdown } from '../store';
import type { TaskDefinition } from '../task';
import { executeJob } from './execute';

export interface QueueLoop {
  /** Waits for in-flight jobs; after timeoutMs, re-queues the rest without spending an attempt. */
  drain(timeoutMs: number): Promise<void>;
}

const attemptOf = (job: BossJob) => ({ id: job.id, retryCount: job.retryCount });

/**
 * One poller per queue (pg-boss `work()` would spawn one poller per concurrency
 * slot). Fetches up to the free slots, refetches immediately when a slot frees.
 */
export function startQueueLoop(params: {
  boss: BossLike;
  definition: TaskDefinition;
  concurrency: number;
  pollMs: number;
  signal: AbortSignal;
}): QueueLoop {
  const { boss, definition, concurrency, pollMs, signal } = params;
  const name = definition.id;
  // Keyed per attempt: a job pg-boss expired and handed out again must not evict the older entry.
  const inFlight = new Map<string, { job: BossJob; done: Promise<void> }>();
  let wake: (() => void) | undefined;

  const handle = (job: BossJob) => {
    const key = `${job.id}:${job.retryCount}`;
    const done = executeJob({ definition, job })
      .then((outcome) =>
        outcome.kind === 'complete'
          ? boss.complete(name, attemptOf(job), null)
          : boss.fail(name, attemptOf(job), outcome.error),
      )
      .catch((error) => console.error(`[jobs] ${name} job ${job.id} crashed`, error))
      .then(() => {
        inFlight.delete(key);
        wake?.();
      });
    inFlight.set(key, { job, done });
  };

  const sleep = () =>
    new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, pollMs);
      wake = finish;
      signal.addEventListener('abort', finish);
    });

  const loop = async () => {
    while (!signal.aborted) {
      const free = concurrency - inFlight.size;
      if (free > 0) {
        try {
          const jobs = await boss.fetch(name, { batchSize: free, includeMetadata: true });
          jobs.forEach(handle);
          if (jobs.length === free) continue;
        } catch (error) {
          console.error(`[jobs] fetch failed for ${name}`, error);
        }
      }
      await sleep();
    }
  };
  const running = loop();

  return {
    async drain(timeoutMs) {
      await running;
      const all = Promise.all([...inFlight.values()].map((entry) => entry.done));
      await Promise.race([all, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
      await Promise.all(
        [...inFlight.values()].map(async ({ job }) => {
          await releaseForShutdown({ queue: name, job });
          await boss.fail(name, attemptOf(job), { message: 'Worker shut down before the run finished' });
        }),
      );
    },
  };
}
