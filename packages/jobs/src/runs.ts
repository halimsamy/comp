import { getBoss } from './boss';
import { currentRun } from './context';
import { normalizeTags, statusFlags } from './options';
import { addRunTags, cancelRunRow, getRunRow, type JobRunRow } from './store';
import type { RetrievedRun, RunOutput } from './types';

export function toRetrievedRun<TOutput>(row: JobRunRow): RetrievedRun<TOutput> {
  return {
    id: row.id,
    taskIdentifier: row.taskId,
    status: row.status,
    // JSON from the database; typed by the caller's generic like trigger.dev's runs.retrieve<T>.
    output: (row.output ?? undefined) as TOutput | undefined,
    error: row.error ?? undefined,
    metadata: row.metadata,
    tags: row.tags,
    organizationId: row.organizationId,
    parentRunId: row.parentRunId,
    idempotencyKey: row.idempotencyKey,
    attemptCount: row.attempt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    ...statusFlags(row.status),
  };
}

export const runs = {
  /** Throws when the run does not exist. There is no `payload` (payloads are not stored). */
  async retrieve<T = unknown>(runId: string): Promise<RetrievedRun<RunOutput<T>>> {
    const row = await getRunRow(runId);
    if (!row) throw new Error(`Run ${runId} not found`);
    return toRetrievedRun<RunOutput<T>>(row);
  },

  /**
   * Marks the run CANCELED and removes its queued job. Code already executing is
   * not interrupted, but its result is discarded (RunParams.signal is not aborted).
   */
  async cancel(runId: string): Promise<{ id: string }> {
    const row = await cancelRunRow(runId);
    if (row?.bossJobId) {
      const boss = await getBoss();
      await boss.cancel(row.taskId, row.bossJobId);
    }
    return { id: runId };
  },
};

export const tags = {
  /** Adds tags to the current run. No-op outside a run. */
  async add(value: string | string[]): Promise<void> {
    const run = currentRun();
    if (!run) return;
    const newTags = normalizeTags(value);
    run.tags = [...new Set([...run.tags, ...newTags])];
    await addRunTags({ runId: run.runId, tags: newTags });
  },
};
