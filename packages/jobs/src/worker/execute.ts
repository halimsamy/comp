import { z } from 'zod';
import type { BossJob } from '../boss';
import { runWithContext, type ActiveRun } from '../context';
import { metadata } from '../metadata';
import { attemptTimeoutSeconds, toRunError } from '../options';
import {
  claimRun,
  finishRun,
  insertRun,
  previousRunAt,
  requeueRun,
  setBossJobId,
  type JobRunRow,
} from '../store';
import type { TaskDefinition } from '../task';
import type { RunError, ScheduledPayload } from '../types';

const jobDataSchema = z.union([
  z.object({ schedule: z.literal(true) }),
  z.object({
    runId: z.string(),
    payload: z.unknown(),
    maxDuration: z.number().optional(),
    ttlDeadline: z.string().optional(),
  }),
]);

/** What the loop tells pg-boss: complete the job, or fail it (pg-boss retries if allowed). */
export type ExecuteOutcome = { kind: 'complete' } | { kind: 'fail'; error: RunError };

class MaxDurationExceededError extends Error {
  constructor(seconds: number) {
    super(`Run exceeded maxDuration of ${seconds}s`);
    this.name = 'MaxDurationExceededError';
  }
}

/** Cron jobs carry no run; create one (idempotent per pg-boss job, so retries reuse it). */
async function createScheduledRun(params: { definition: TaskDefinition; job: BossJob }) {
  const { definition, job } = params;
  const { row } = await insertRun({
    taskId: definition.id,
    status: 'QUEUED',
    tags: [],
    organizationId: null,
    parentRunId: null,
    rootRunId: null,
    idempotencyKey: `schedule:${job.id}`,
    idempotencyKeyExpiresAt: null,
    metadata: {},
  });
  await setBossJobId({ runId: row.id, bossJobId: job.id });
  const payload: ScheduledPayload = {
    timestamp: job.createdOn,
    lastTimestamp: await previousRunAt({ taskId: definition.id, beforeRunId: row.id }),
    timezone: 'UTC',
    scheduleId: definition.id,
    type: 'DECLARATIVE',
    upcoming: [],
  };
  return { runId: row.id, payload };
}

async function runWithTimeout(params: {
  definition: TaskDefinition;
  row: JobRunRow;
  payload: unknown;
  maxDuration: number | undefined;
  expireInSeconds: number;
}): Promise<unknown> {
  const { definition, row, payload } = params;
  const active: ActiveRun = {
    runId: row.id,
    taskId: row.taskId,
    parentRunId: row.parentRunId,
    rootRunId: row.rootRunId,
    attempt: row.attempt,
    tags: row.tags,
    metadata: { ...row.metadata },
  };
  const ctx = {
    run: { id: row.id, tags: row.tags, idempotencyKey: row.idempotencyKey, createdAt: row.createdAt },
    task: { id: row.taskId },
    attempt: { number: row.attempt },
  };
  const controller = new AbortController();
  const seconds = attemptTimeoutSeconds({
    maxDuration: params.maxDuration ?? definition.maxDuration,
    expireInSeconds: params.expireInSeconds,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new MaxDurationExceededError(seconds));
    }, seconds * 1000);
  });
  try {
    const execution = runWithContext(active, () =>
      definition.run(definition.parsePayload(payload), { ctx, signal: controller.signal }),
    );
    return await Promise.race([execution, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function executeJob(params: {
  definition: TaskDefinition;
  job: BossJob;
}): Promise<ExecuteOutcome> {
  const { definition, job } = params;
  const data = jobDataSchema.parse(job.data);
  const { runId, payload } =
    'schedule' in data ? await createScheduledRun({ definition, job }) : data;

  const row = await claimRun({ runId, attempt: job.retryCount + 1 });
  // Already terminal (canceled, expired, ...): drop the job.
  if (!row) return { kind: 'complete' };

  const ttlDeadline = 'ttlDeadline' in data ? data.ttlDeadline : undefined;
  if (ttlDeadline && job.retryCount === 0 && Date.now() > Date.parse(ttlDeadline)) {
    await finishRun({ runId, status: 'EXPIRED', error: { message: 'Run expired before it started (ttl)' } });
    return { kind: 'complete' };
  }

  let output: unknown;
  try {
    output = await runWithTimeout({
      definition,
      row,
      payload,
      maxDuration: 'maxDuration' in data ? data.maxDuration : undefined,
      expireInSeconds: job.expireInSeconds,
    });
  } catch (error) {
    await metadata.flush();
    const runError = toRunError(error);
    // trigger.dev does not retry runs that hit maxDuration.
    if (error instanceof MaxDurationExceededError) {
      await finishRun({ runId, status: 'TIMED_OUT', error: runError });
      return { kind: 'complete' };
    }
    const isFinalAttempt = job.retryCount >= job.retryLimit;
    if (isFinalAttempt) await finishRun({ runId, status: 'FAILED', error: runError });
    else await requeueRun({ runId, error: runError });
    return { kind: 'fail', error: runError };
  }

  await metadata.flush();
  await finishRun({ runId, status: 'COMPLETED', output: output ?? null });
  return { kind: 'complete' };
}
