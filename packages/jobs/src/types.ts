/**
 * Any Standard Schema with a parse() method (zod 3.24+/4). Typed structurally so the
 * app's zod copy does not have to be the same instance as this package's.
 */
export interface PayloadSchema<TInput = unknown, TOutput = unknown> {
  parse(value: unknown): TOutput;
  readonly '~standard': { readonly types?: { readonly input: TInput; readonly output: TOutput } };
}
export type SchemaInput<T extends PayloadSchema> = NonNullable<T['~standard']['types']>['input'];
export type SchemaOutput<T extends PayloadSchema> = NonNullable<T['~standard']['types']>['output'];

/**
 * Trigger.dev run status strings. Only QUEUED, DELAYED, EXECUTING, COMPLETED,
 * FAILED, CANCELED, TIMED_OUT, EXPIRED and CRASHED are ever produced; the rest
 * stay in the union so existing `status === '...'` comparisons keep compiling.
 */
export type RunStatus =
  | 'PENDING_VERSION'
  | 'WAITING_FOR_DEPLOY'
  | 'PENDING'
  | 'QUEUED'
  | 'DEQUEUED'
  | 'DELAYED'
  | 'WAITING'
  | 'EXECUTING'
  | 'REATTEMPTING'
  | 'FROZEN'
  | 'COMPLETED'
  | 'CANCELED'
  | 'FAILED'
  | 'CRASHED'
  | 'INTERRUPTED'
  | 'SYSTEM_FAILURE'
  | 'EXPIRED'
  | 'TIMED_OUT';

export interface RunError {
  message: string;
  name?: string;
}

export interface RetryOptions {
  /** Total attempts including the first one (trigger.dev semantics). */
  maxAttempts?: number;
  minTimeoutInMs?: number;
  maxTimeoutInMs?: number;
  /** Accepted for compatibility; pg-boss always uses factor 2. */
  factor?: number;
  /** Accepted for compatibility; pg-boss always adds jitter. */
  randomize?: boolean;
}

export interface QueueOptions {
  /** Informational: every task gets its own pg-boss queue named after its id. */
  name?: string;
  concurrencyLimit?: number;
}

/** Accepted and ignored: workers run on whatever machine they are deployed to. */
export type MachinePreset = string | { preset?: string; cpu?: number; memory?: number };

export interface TaskContext {
  run: { id: string; tags: string[]; idempotencyKey: string | null; createdAt: Date };
  task: { id: string };
  attempt: { number: number };
}

export interface RunParams {
  ctx: TaskContext;
  /** Aborted when the run exceeds maxDuration or is canceled. */
  signal: AbortSignal;
}

interface BaseTaskConfig<TId extends string> {
  id: TId;
  description?: string;
  retry?: RetryOptions;
  queue?: QueueOptions;
  /** Seconds. Includes time spent in triggerAndWait (unlike trigger.dev). */
  maxDuration?: number;
  machine?: MachinePreset;
}

export interface TaskConfig<TId extends string, TPayload, TOutput> extends BaseTaskConfig<TId> {
  run: (payload: TPayload, params: RunParams) => Promise<TOutput>;
}

export interface SchemaTaskConfig<TId extends string, TSchema extends PayloadSchema, TOutput>
  extends BaseTaskConfig<TId> {
  schema: TSchema;
  run: (payload: SchemaOutput<TSchema>, params: RunParams) => Promise<TOutput>;
}

export interface ScheduledPayload {
  timestamp: Date;
  lastTimestamp?: Date;
  timezone: string;
  scheduleId: string;
  type: 'DECLARATIVE';
  upcoming: Date[];
}

export interface ScheduleTaskConfig<TId extends string, TOutput> extends BaseTaskConfig<TId> {
  /** 5-field cron expression, evaluated in UTC. */
  cron: string;
  run: (payload: ScheduledPayload, params: RunParams) => Promise<TOutput>;
}

export interface TriggerOptions {
  tags?: string | string[];
  idempotencyKey?: string | string[];
  /** e.g. '5m', '7d', or seconds. Default 30 days. */
  idempotencyKeyTTL?: string | number;
  /** e.g. '10m', seconds, or a Date. */
  delay?: string | number | Date;
  /** Expire the run if it has not started within this window. */
  ttl?: string | number;
  maxAttempts?: number;
  maxDuration?: number;
  metadata?: Record<string, unknown>;
  /** With `queue.concurrencyLimit: 1`: one active run per key (pg-boss singletonKey). Otherwise ignored. */
  concurrencyKey?: string;
  /** Accepted and ignored: runs always go to the task's own queue. */
  queue?: string | { name: string };
  /** Accepted and ignored. */
  machine?: MachinePreset;
}

export interface RunHandle<TId extends string = string> {
  id: string;
  taskIdentifier: TId;
}

export interface BatchItem<TPayload> {
  payload: TPayload;
  options?: TriggerOptions;
}

export interface BatchHandle<TId extends string = string> {
  batchId: string;
  runCount: number;
  runs: RunHandle<TId>[];
}

export type TaskRunResult<TOutput> =
  | { ok: true; id: string; taskIdentifier: string; output: TOutput }
  | { ok: false; id: string; taskIdentifier: string; error: RunError };

export type TaskRunPromise<TOutput> = Promise<TaskRunResult<TOutput>> & {
  unwrap(): Promise<TOutput>;
};

export interface BatchResult<TOutput> {
  id: string;
  runs: TaskRunResult<TOutput>[];
}

export interface Task<TId extends string = string, TPayload = unknown, TOutput = unknown> {
  readonly id: TId;
  trigger(payload: TPayload, options?: TriggerOptions): Promise<RunHandle<TId>>;
  batchTrigger(items: BatchItem<TPayload>[]): Promise<BatchHandle<TId>>;
  triggerAndWait(payload: TPayload, options?: TriggerOptions): TaskRunPromise<TOutput>;
  batchTriggerAndWait(items: BatchItem<TPayload>[]): Promise<BatchResult<TOutput>>;
}

export type AnyTask = Task<string, never, unknown>;
/** Default for `tasks.*` calls without `<typeof task>`: any payload, unknown output. */
export type UntypedTask = Task<string, unknown, unknown>;
export type TaskIdentifier<T> = T extends Task<infer I, never, unknown> ? I : string;
export type TaskPayload<T> = T extends Task<string, infer P, unknown> ? P : unknown;
export type TaskOutput<T> = T extends Task<string, never, infer O> ? O : unknown;
/** `RunOutput<typeof myTask>` = the task's output; any other type passes through. */
export type RunOutput<T> = T extends AnyTask ? TaskOutput<T> : T;

export interface RetrievedRun<TOutput = unknown> {
  id: string;
  taskIdentifier: string;
  status: RunStatus;
  output: TOutput | undefined;
  error: RunError | undefined;
  metadata: Record<string, unknown>;
  tags: string[];
  organizationId: string | null;
  parentRunId: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | undefined;
  finishedAt: Date | undefined;
  isQueued: boolean;
  isExecuting: boolean;
  /** True for every terminal status (success or not), like trigger.dev. */
  isCompleted: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  isCancelled: boolean;
}
