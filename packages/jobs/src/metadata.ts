import { currentRun } from './context';
import { applyMetadataOp, type MetadataOp } from './store';

const CHAIN_KEY = Symbol.for('@trycompai/jobs/metadata-chain');
const globalChain = globalThis as typeof globalThis & { [CHAIN_KEY]?: { tail: Promise<void> } };
const chain = (globalChain[CHAIN_KEY] ??= { tail: Promise.resolve() });

/** Writes are fire-and-forget (like trigger.dev) but kept in order; flush() awaits them. */
function enqueue(runId: string, op: MetadataOp) {
  chain.tail = chain.tail
    .then(() => applyMetadataOp({ runId, op }))
    .catch((error) => console.error('[jobs] metadata write failed', { runId, op: op.type, error }));
}

function applyLocal(target: Record<string, unknown>, op: MetadataOp) {
  if (op.type === 'set') target[op.key] = op.value;
  if (op.type === 'del') delete target[op.key];
  if (op.type === 'increment') {
    const current = target[op.key];
    target[op.key] = (typeof current === 'number' ? current : 0) + op.by;
  }
  if (op.type === 'append') {
    const current = target[op.key];
    target[op.key] = [...(Array.isArray(current) ? current : []), op.value];
  }
}

export interface MetadataUpdater {
  set(key: string, value: unknown): MetadataUpdater;
  del(key: string): MetadataUpdater;
  append(key: string, value: unknown): MetadataUpdater;
  increment(key: string, by?: number): MetadataUpdater;
  decrement(key: string, by?: number): MetadataUpdater;
}

type Target = 'self' | 'parent' | 'root';

function createUpdater(target: Target): MetadataUpdater {
  const apply = (op: MetadataOp): MetadataUpdater => {
    const run = currentRun();
    // Outside a run (API/Next.js process) metadata calls are no-ops, like trigger.dev.
    if (!run) return updater;
    // A root run is its own parent/root (trigger.dev semantics).
    const runId =
      target === 'parent' ? (run.parentRunId ?? run.runId)
      : target === 'root' ? (run.rootRunId ?? run.runId)
      : run.runId;
    if (runId === run.runId) applyLocal(run.metadata, op);
    enqueue(runId, op);
    return updater;
  };
  const updater: MetadataUpdater = {
    set: (key, value) => apply({ type: 'set', key, value }),
    del: (key) => apply({ type: 'del', key }),
    append: (key, value) => apply({ type: 'append', key, value }),
    increment: (key, by = 1) => apply({ type: 'increment', key, by }),
    decrement: (key, by = 1) => apply({ type: 'increment', key, by: -by }),
  };
  return updater;
}

const self = createUpdater('self');
const parent = createUpdater('parent');
const root = createUpdater('root');

export const metadata = {
  ...self,
  get(key: string): unknown {
    return currentRun()?.metadata[key];
  },
  current(): Record<string, unknown> | undefined {
    const run = currentRun();
    return run ? { ...run.metadata } : undefined;
  },
  /** Awaits every queued metadata write (the worker calls this before finishing a run). */
  async flush(): Promise<void> {
    let tail: Promise<void>;
    do {
      tail = chain.tail;
      await tail;
    } while (tail !== chain.tail);
  },
  parent,
  root,
};
