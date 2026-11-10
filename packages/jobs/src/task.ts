import {
  batchTriggerAndWaitTasks,
  batchTriggerTasks,
  triggerAndWaitTask,
  triggerTask,
} from './trigger';
import type {
  PayloadSchema,
  QueueOptions,
  ScheduledPayload,
  RetryOptions,
  RunParams,
  SchemaInput,
  SchemaOutput,
  ScheduleTaskConfig,
  SchemaTaskConfig,
  Task,
  TaskConfig,
} from './types';

/** Marks exported task handles so the worker can find them in imported modules. */
export const TASK_DEFINITION = Symbol.for('@trycompai/jobs/task-definition');

export interface TaskDefinition {
  id: string;
  kind: 'task' | 'schedule';
  cron?: string;
  retry?: RetryOptions;
  queue?: QueueOptions;
  maxDuration?: number;
  /** Validates/parses the payload (schemaTask) or passes it through. */
  parsePayload: (payload: unknown) => unknown;
  run: (payload: unknown, params: RunParams) => Promise<unknown>;
}

type TaskHandle<TId extends string, TPayload, TOutput> = Task<TId, TPayload, TOutput> & {
  readonly [TASK_DEFINITION]: TaskDefinition;
};

export function getTaskDefinition(value: unknown): TaskDefinition | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return undefined;
  if (!(TASK_DEFINITION in value)) return undefined;
  return (value as { [TASK_DEFINITION]: TaskDefinition })[TASK_DEFINITION];
}

function createHandle<TId extends string, TPayload, TOutput>(
  definition: TaskDefinition & { id: TId },
): TaskHandle<TId, TPayload, TOutput> {
  const taskId = definition.id;
  return {
    id: taskId,
    [TASK_DEFINITION]: definition,
    trigger: (payload, options) =>
      triggerTask({ taskId, payload, options }).then((h) => ({ ...h, taskIdentifier: taskId })),
    batchTrigger: (items) =>
      batchTriggerTasks({ taskId, items }).then((batch) => ({
        ...batch,
        runs: batch.runs.map((run) => ({ ...run, taskIdentifier: taskId })),
      })),
    triggerAndWait: (payload, options) => triggerAndWaitTask<TOutput>({ taskId, payload, options }),
    batchTriggerAndWait: (items) => batchTriggerAndWaitTasks<TOutput>({ taskId, items }),
  };
}

/** trigger.dev `task()`. The payload is trusted as typed (no runtime validation). */
export function task<TId extends string, TPayload = void, TOutput = unknown>(
  config: TaskConfig<TId, TPayload, TOutput>,
): Task<TId, TPayload, TOutput> {
  return createHandle<TId, TPayload, TOutput>({
    id: config.id,
    kind: 'task',
    retry: config.retry,
    queue: config.queue,
    maxDuration: config.maxDuration,
    parsePayload: (payload) => payload,
    // Payload arrives as JSON from pg-boss; trusting its shape matches trigger.dev's task().
    run: (payload, params) => config.run(payload as TPayload, params),
  });
}

/** trigger.dev `schemaTask()`. The payload is parsed with the zod schema before run. */
export function schemaTask<TId extends string, TSchema extends PayloadSchema, TOutput = unknown>(
  config: SchemaTaskConfig<TId, TSchema, TOutput>,
): Task<TId, SchemaInput<TSchema>, TOutput> {
  return createHandle<TId, SchemaInput<TSchema>, TOutput>({
    id: config.id,
    kind: 'task',
    retry: config.retry,
    queue: config.queue,
    maxDuration: config.maxDuration,
    parsePayload: (payload) => config.schema.parse(payload),
    run: (payload, params) => config.run(payload as SchemaOutput<TSchema>, params),
  });
}

export const schedules = {
  /** trigger.dev `schedules.task()`. Cron is registered (UTC) by the worker at startup. */
  task<TId extends string, TOutput = unknown>(
    config: ScheduleTaskConfig<TId, TOutput>,
  ): Task<TId, ScheduledPayload, TOutput> {
    return createHandle({
      id: config.id,
      kind: 'schedule',
      cron: config.cron,
      retry: config.retry,
      queue: config.queue,
      maxDuration: config.maxDuration,
      parsePayload: (payload) => payload,
      run: (payload, params) => config.run(payload as ScheduledPayload, params),
    });
  },
};

/**
 * trigger.dev `queue()`. concurrencyLimit becomes the worker's per-process concurrency, except 1:
 * a cluster-wide pg-boss singleton queue (one active run per `concurrencyKey`).
 */
export function queue(options: QueueOptions): QueueOptions {
  return options;
}
