import type { RetrievedRun, RetryOptions, RunStatus, TriggerOptions } from './types';

/** Defaults copied from the old trigger.config.ts files. */
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_MIN_TIMEOUT_MS = 1000;
export const DEFAULT_MAX_TIMEOUT_MS = 10000;
export const DEFAULT_MAX_DURATION_SECONDS = 300;
export const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 30 * 24 * 60 * 60;
/** pg-boss refuses expireInSeconds above 24h. */
const PG_BOSS_MAX_EXPIRE_SECONDS = 24 * 60 * 60;
/** Gap between our own maxDuration timer and pg-boss's expiration safety net. */
const EXPIRE_GRACE_SECONDS = 120;
/** Delete pg-boss job rows (which hold full payloads) a day after they finish. */
export const JOB_ROW_RETENTION_SECONDS = 24 * 60 * 60;

export const ACTIVE_STATUSES = ['QUEUED', 'DELAYED', 'EXECUTING'] as const;
const SUCCESS_STATUSES: readonly RunStatus[] = ['COMPLETED'];
const FAILED_STATUSES: readonly RunStatus[] = [
  'FAILED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'INTERRUPTED',
  'TIMED_OUT',
  'EXPIRED',
];
const TERMINAL_STATUSES: readonly RunStatus[] = [
  ...SUCCESS_STATUSES,
  ...FAILED_STATUSES,
  'CANCELED',
];

export function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/** Parses trigger.dev duration strings ('30s', '5m', '1h', '7d', '2w') or plain seconds. */
export function parseDurationSeconds(value: string | number): number {
  if (typeof value === 'number') return value;
  const match = /^(\d+(?:\.\d+)?)\s*([smhdw])$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration "${value}" (expected e.g. 30s, 5m, 1h, 7d)`);
  return Number(match[1]) * (UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS] ?? 1);
}

/** delay -> pg-boss startAfter (Date). Strings are durations or ISO dates. */
export function resolveDelay(delay: TriggerOptions['delay']): Date | undefined {
  if (delay === undefined) return undefined;
  if (delay instanceof Date) return delay;
  if (typeof delay === 'string' && /^\d{4}-\d{2}-\d{2}/.test(delay)) return new Date(delay);
  return new Date(Date.now() + parseDurationSeconds(delay) * 1000);
}

/** Our own timer: maxDuration seconds, clamped below pg-boss's 24h ceiling. */
export function effectiveMaxDurationSeconds(maxDuration: number | undefined): number {
  const seconds = maxDuration ?? DEFAULT_MAX_DURATION_SECONDS;
  return Math.max(1, Math.min(seconds, PG_BOSS_MAX_EXPIRE_SECONDS - EXPIRE_GRACE_SECONDS));
}

/**
 * Our timer for a fetched job. pg-boss copies expire_seconds onto the row at send time, so a
 * job queued before a deploy that raised maxDuration keeps the old expiry; the timer must fire
 * before pg-boss expires (and retries) the still-running attempt.
 */
export function attemptTimeoutSeconds(params: {
  maxDuration: number | undefined;
  expireInSeconds: number;
}): number {
  const fromJob = params.expireInSeconds - EXPIRE_GRACE_SECONDS;
  return Math.max(1, Math.min(effectiveMaxDurationSeconds(params.maxDuration), fromJob));
}

/** pg-boss expireInSeconds: the safety net behind our own maxDuration timer. */
export function toExpireInSeconds(maxDuration: number | undefined): number {
  return effectiveMaxDurationSeconds(maxDuration) + EXPIRE_GRACE_SECONDS;
}

/** trigger.dev counts attempts; pg-boss counts retries after the first attempt. */
export function toRetryLimit(maxAttempts: number | undefined): number {
  return Math.max(0, (maxAttempts ?? DEFAULT_MAX_ATTEMPTS) - 1);
}

export interface QueueSettings {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: true;
  retryDelayMax: number;
  expireInSeconds: number;
  deleteAfterSeconds: number;
}

export function toQueueSettings(params: {
  retry?: RetryOptions;
  maxDuration?: number;
}): QueueSettings {
  const { retry, maxDuration } = params;
  return {
    retryLimit: toRetryLimit(retry?.maxAttempts),
    retryDelay: Math.max(1, Math.ceil((retry?.minTimeoutInMs ?? DEFAULT_MIN_TIMEOUT_MS) / 1000)),
    retryBackoff: true,
    retryDelayMax: Math.max(1, Math.ceil((retry?.maxTimeoutInMs ?? DEFAULT_MAX_TIMEOUT_MS) / 1000)),
    expireInSeconds: toExpireInSeconds(maxDuration),
    deleteAfterSeconds: JOB_ROW_RETENTION_SECONDS,
  };
}

export interface SendSettings {
  startAfter?: Date;
  retryLimit?: number;
  expireInSeconds?: number;
  singletonKey?: string;
}

/** Per-call trigger options that map onto pg-boss send options. */
export function toSendSettings(options: TriggerOptions | undefined): SendSettings {
  const settings: SendSettings = {};
  const startAfter = resolveDelay(options?.delay);
  if (startAfter) settings.startAfter = startAfter;
  // On a singleton queue (concurrencyLimit 1) pg-boss allows one active job per key; other queues ignore it.
  if (options?.concurrencyKey) settings.singletonKey = options.concurrencyKey;
  if (options?.maxAttempts !== undefined) settings.retryLimit = toRetryLimit(options.maxAttempts);
  if (options?.maxDuration !== undefined) {
    settings.expireInSeconds = toExpireInSeconds(options.maxDuration);
  }
  return settings;
}

export function normalizeTags(tags: TriggerOptions['tags']): string[] {
  if (!tags) return [];
  return [...new Set(Array.isArray(tags) ? tags : [tags])];
}

/** organizationId / orgId from the payload, when it is a string. */
export function extractOrganizationId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const value = record.organizationId ?? record.orgId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function statusFlags(
  status: RunStatus,
): Pick<RetrievedRun, 'isQueued' | 'isExecuting' | 'isCompleted' | 'isSuccess' | 'isFailed' | 'isCancelled'> {
  return {
    isQueued: status === 'QUEUED' || status === 'DELAYED',
    isExecuting: status === 'EXECUTING',
    isCompleted: isTerminalStatus(status),
    isSuccess: SUCCESS_STATUSES.includes(status),
    isFailed: FAILED_STATUSES.includes(status),
    isCancelled: status === 'CANCELED',
  };
}

export function toRunError(error: unknown): { message: string; name?: string } {
  if (error instanceof Error) return { message: error.message, name: error.name };
  return { message: typeof error === 'string' ? error : JSON.stringify(error) ?? 'Unknown error' };
}
