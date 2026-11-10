import { createHash, randomUUID } from 'node:crypto';
import { getBoss } from './boss';
import { currentRun } from './context';
import {
  DEFAULT_IDEMPOTENCY_TTL_SECONDS,
  extractOrganizationId,
  isTerminalStatus,
  normalizeTags,
  parseDurationSeconds,
  toRunError,
  toSendSettings,
  type SendSettings,
} from './options';
import { finishRun, getRunRows, insertRun, setBossJobId, type JobRunRow } from './store';
import type {
  AnyTask,
  UntypedTask,
  BatchHandle,
  BatchItem,
  BatchResult,
  RunHandle,
  TaskIdentifier,
  TaskOutput,
  TaskPayload,
  TaskRunPromise,
  TaskRunResult,
  TriggerOptions,
} from './types';

/** What we put in the pg-boss job. Schedule-created jobs carry `{ schedule: true }` instead. */
export interface JobData {
  runId: string;
  payload: unknown;
  maxDuration?: number;
  /** ISO time after which a not-yet-started run is EXPIRED (trigger option `ttl`). */
  ttlDeadline?: string;
}

const KEY_PREFIX = 'idk_';
const BATCH_CHUNK = 25;
const QUEUE_NOT_FOUND = 'PGBOSS_QUEUE_NOT_FOUND';

export const idempotencyKeys = {
  /** Same scopes as trigger.dev: 'run' (default) and 'attempt' scope to the current run. */
  async create(
    key: string | string[],
    options?: { scope?: 'run' | 'attempt' | 'global' },
  ): Promise<string> {
    const raw = Array.isArray(key) ? key.join('-') : key;
    const run = currentRun();
    const scope = options?.scope ?? 'run';
    const prefix =
      !run || scope === 'global' ? '' : scope === 'attempt' ? `${run.runId}:${run.attempt}` : run.runId;
    return KEY_PREFIX + createHash('sha256').update(`${prefix}|${raw}`).digest('hex');
  },
};

async function resolveIdempotencyKey(key: TriggerOptions['idempotencyKey']) {
  if (key === undefined) return null;
  if (typeof key === 'string' && key.startsWith(KEY_PREFIX)) return key;
  // Raw keys inside a run are run-scoped (trigger.dev behavior); outside a run they are global.
  return idempotencyKeys.create(key);
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function sendJob(params: { taskId: string; data: JobData; settings: SendSettings }) {
  const { taskId, data, settings } = params;
  const boss = await getBoss();
  let jobId: string | null;
  try {
    jobId = await boss.send(taskId, data, settings);
  } catch (error) {
    if (!hasCode(error, QUEUE_NOT_FOUND)) throw error;
    // Only workers create queues: policy and retry/expiry settings are fixed onto queued jobs,
    // so a queue created here with pg-boss defaults would be wrong for good.
    throw new Error(
      `Queue for task "${taskId}" does not exist yet. Start (deploy) the worker that owns it first.`,
      { cause: error },
    );
  }
  if (!jobId) throw new Error(`pg-boss did not accept a job for ${taskId}`);
  return jobId;
}

export async function triggerTask(params: {
  taskId: string;
  payload: unknown;
  options?: TriggerOptions;
}): Promise<RunHandle> {
  const { taskId, payload, options } = params;
  const parent = currentRun();
  const settings = toSendSettings(options);
  const idempotencyKey = await resolveIdempotencyKey(options?.idempotencyKey);
  const ttlSeconds = parseDurationSeconds(options?.idempotencyKeyTTL ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS);
  const { row, cached } = await insertRun({
    taskId,
    status: settings.startAfter ? 'DELAYED' : 'QUEUED',
    tags: normalizeTags(options?.tags),
    organizationId: extractOrganizationId(payload),
    parentRunId: parent?.runId ?? null,
    rootRunId: parent ? (parent.rootRunId ?? parent.runId) : null,
    idempotencyKey,
    idempotencyKeyExpiresAt: idempotencyKey ? new Date(Date.now() + ttlSeconds * 1000) : null,
    metadata: options?.metadata ?? {},
  });
  if (cached) return { id: row.id, taskIdentifier: taskId };

  const data: JobData = { runId: row.id, payload };
  if (options?.maxDuration !== undefined) data.maxDuration = options.maxDuration;
  if (options?.ttl !== undefined) {
    const start = settings.startAfter?.getTime() ?? Date.now();
    data.ttlDeadline = new Date(start + parseDurationSeconds(options.ttl) * 1000).toISOString();
  }
  try {
    const bossJobId = await sendJob({ taskId, data, settings });
    await setBossJobId({ runId: row.id, bossJobId });
  } catch (error) {
    await finishRun({ runId: row.id, status: 'SYSTEM_FAILURE', error: toRunError(error) });
    throw error;
  }
  return { id: row.id, taskIdentifier: taskId };
}

export async function batchTriggerTasks(params: {
  taskId: string;
  items: BatchItem<unknown>[];
}): Promise<BatchHandle> {
  const runs: RunHandle[] = [];
  for (let i = 0; i < params.items.length; i += BATCH_CHUNK) {
    const chunk = params.items.slice(i, i + BATCH_CHUNK);
    const handles = await Promise.all(
      chunk.map((item) =>
        triggerTask({ taskId: params.taskId, payload: item.payload, options: item.options }),
      ),
    );
    runs.push(...handles);
  }
  return { batchId: `batch_${randomUUID()}`, runCount: runs.length, runs };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toResult<TOutput>(row: JobRunRow): TaskRunResult<TOutput> {
  const base = { id: row.id, taskIdentifier: row.taskId };
  if (row.status === 'COMPLETED') return { ...base, ok: true, output: row.output as TOutput };
  return { ...base, ok: false, error: row.error ?? { message: `Run ended with ${row.status}` } };
}

/** Polls JobRun rows (one query per tick for the whole batch) until all are terminal. */
export async function waitForRuns<TOutput>(params: {
  runIds: string[];
  pollMs?: number;
}): Promise<TaskRunResult<TOutput>[]> {
  const done = new Map<string, TaskRunResult<TOutput>>();
  let delay = params.pollMs ?? 1000;
  for (;;) {
    const pending = [...new Set(params.runIds)].filter((id) => !done.has(id));
    if (pending.length === 0) return params.runIds.map((id) => done.get(id)!);
    const rows = await getRunRows(pending);
    if (rows.length !== pending.length) throw new Error('Waited-on run not found');
    for (const row of rows) {
      if (isTerminalStatus(row.status)) done.set(row.id, toResult<TOutput>(row));
    }
    if (rows.every((row) => done.has(row.id))) continue;
    await sleep(delay);
    delay = Math.min(delay * 1.5, 5000);
  }
}

export class SubtaskUnwrapError extends Error {
  constructor(public readonly result: Extract<TaskRunResult<unknown>, { ok: false }>) {
    super(`Run ${result.id} (${result.taskIdentifier}) failed: ${result.error.message}`);
    this.name = 'SubtaskUnwrapError';
  }
}

export function toRunPromise<TOutput>(
  promise: Promise<TaskRunResult<TOutput>>,
): TaskRunPromise<TOutput> {
  return Object.assign(promise, {
    unwrap: () =>
      promise.then((result) => {
        if (result.ok) return result.output;
        throw new SubtaskUnwrapError(result);
      }),
  });
}

export function triggerAndWaitTask<TOutput>(params: {
  taskId: string;
  payload: unknown;
  options?: TriggerOptions;
}): TaskRunPromise<TOutput> {
  return toRunPromise(
    triggerTask(params)
      .then((handle) => waitForRuns<TOutput>({ runIds: [handle.id] }))
      .then(([result]) => result!),
  );
}

export async function batchTriggerAndWaitTasks<TOutput>(params: {
  taskId: string;
  items: BatchItem<unknown>[];
}): Promise<BatchResult<TOutput>> {
  const batch = await batchTriggerTasks(params);
  const runs = await waitForRuns<TOutput>({ runIds: batch.runs.map((run) => run.id) });
  return { id: batch.batchId, runs };
}

/** `tasks.*` — trigger by string id, typed with `<typeof someTask>` like trigger.dev. */
export const tasks = {
  trigger<TTask extends AnyTask = UntypedTask>(
    id: TaskIdentifier<TTask>,
    payload: TaskPayload<TTask>,
    options?: TriggerOptions,
  ): Promise<RunHandle<TaskIdentifier<TTask>>> {
    return triggerTask({ taskId: id, payload, options }).then((h) => ({ ...h, taskIdentifier: id }));
  },
  batchTrigger<TTask extends AnyTask = UntypedTask>(
    id: TaskIdentifier<TTask>,
    items: BatchItem<TaskPayload<TTask>>[],
  ): Promise<BatchHandle> {
    return batchTriggerTasks({ taskId: id, items });
  },
  triggerAndWait<TTask extends AnyTask = UntypedTask>(
    id: TaskIdentifier<TTask>,
    payload: TaskPayload<TTask>,
    options?: TriggerOptions,
  ): TaskRunPromise<TaskOutput<TTask>> {
    return triggerAndWaitTask<TaskOutput<TTask>>({ taskId: id, payload, options });
  },
  batchTriggerAndWait<TTask extends AnyTask = UntypedTask>(
    id: TaskIdentifier<TTask>,
    items: BatchItem<TaskPayload<TTask>>[],
  ): Promise<BatchResult<TaskOutput<TTask>>> {
    return batchTriggerAndWaitTasks<TaskOutput<TTask>>({ taskId: id, items });
  },
};
