import { AsyncLocalStorage } from 'node:async_hooks';

/** State of the run currently executing in this async context (worker only). */
export interface ActiveRun {
  runId: string;
  taskId: string;
  parentRunId: string | null;
  rootRunId: string | null;
  attempt: number;
  tags: string[];
  /** Local copy so metadata.get/current are synchronous. */
  metadata: Record<string, unknown>;
}

const STORAGE_KEY = Symbol.for('@trycompai/jobs/run-context');
const globalStore = globalThis as typeof globalThis & {
  [STORAGE_KEY]?: AsyncLocalStorage<ActiveRun>;
};
const storage = (globalStore[STORAGE_KEY] ??= new AsyncLocalStorage<ActiveRun>());

export function runWithContext<T>(run: ActiveRun, fn: () => T): T {
  return storage.run(run, fn);
}

export function currentRun(): ActiveRun | undefined {
  return storage.getStore();
}
