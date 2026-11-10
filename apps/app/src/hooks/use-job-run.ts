'use client';

import { apiClient } from '@/lib/api-client';
import type { RunOutput, RunStatus } from '@trycompai/jobs';
import { useEffect, useRef } from 'react';
import useSWR from 'swr';

/** GET /v1/job-runs/:runId (dates arrive as ISO strings). */
export interface JobRun<TOutput = unknown> {
  id: string;
  taskId: string;
  status: RunStatus;
  output: TOutput | null;
  error: { message: string; name?: string } | null;
  metadata: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// Kept local so this client hook never pulls the server-side jobs runtime into the bundle.
const TERMINAL_STATUSES: readonly RunStatus[] = [
  'COMPLETED',
  'FAILED',
  'CANCELED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'INTERRUPTED',
  'TIMED_OUT',
  'EXPIRED',
];

/** The run does not exist (or is not visible to this user). Transient failures are not this. */
export class JobRunNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobRunNotFoundError';
  }
}

export function isJobRunFinished(status: RunStatus | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.includes(status);
}

export interface UseJobRunOptions<TOutput> {
  enabled?: boolean;
  /** Poll interval in ms while the run is active. Default 2000. */
  refreshInterval?: number;
  /**
   * Called once per run when it reaches any terminal status (check `run.status`).
   * `error` exists only for useRealtimeRun signature compatibility and is never passed.
   */
  onComplete?: (run: JobRun<TOutput>, error?: Error) => void;
}

/**
 * Polls a background job run until it finishes. Drop-in for trigger.dev's
 * useRealtimeRun/useRun: `useJobRun<typeof myTask>(runId, { enabled, onComplete })`.
 * No access token: the API authorizes by session + active organization.
 */
export function useJobRun<T = unknown>(
  runId: string | null | undefined,
  options: UseJobRunOptions<RunOutput<T>> = {},
) {
  const { enabled = true, refreshInterval = 2000, onComplete } = options;
  const key = enabled && runId ? (['job-run', runId] as const) : null;

  const { data, error, isLoading } = useSWR(
    key,
    async ([, id]) => {
      const response = await apiClient.get<JobRun<RunOutput<T>>>(
        `/v1/job-runs/${encodeURIComponent(id)}`,
      );
      if (response.status === 404) {
        throw new JobRunNotFoundError(response.error ?? 'Run not found');
      }
      if (response.error || !response.data) {
        throw new Error(response.error ?? 'Failed to load run');
      }
      return response.data;
    },
    {
      refreshInterval: (latest) => (isJobRunFinished(latest?.status) ? 0 : refreshInterval),
      revalidateOnFocus: false,
      // SWR pauses refreshInterval while the last poll failed, so retries carry polling;
      // back off from refreshInterval up to 30s instead of SWR's default (minutes).
      onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
        if (err instanceof JobRunNotFoundError) return;
        const delay = Math.min(refreshInterval * 2 ** Math.min(retryCount, 10), 30_000);
        setTimeout(() => revalidate({ retryCount }), delay);
      },
    },
  );

  // Stale data from a previous runId never reaches callers.
  const run = data && data.id === runId ? data : undefined;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRunId = useRef<string | null>(null);
  useEffect(() => {
    if (!run || !isJobRunFinished(run.status)) return;
    if (completedRunId.current === run.id) return;
    completedRunId.current = run.id;
    onCompleteRef.current?.(run);
  }, [run]);

  // Only a missing run is an error for callers: a blip, 5xx or 429 keeps the last `run`
  // while polling continues, so a still-running job never looks failed.
  return { run, error: error instanceof JobRunNotFoundError ? error : undefined, isLoading };
}
