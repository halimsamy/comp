import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));

import { isJobRunFinished, useJobRun, type JobRun } from './use-job-run';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

const runResponse = (overrides: Partial<JobRun> = {}): { data: JobRun; status: number } => ({
  status: 200,
  data: {
    id: 'jrun_1',
    taskId: 'export-evidence',
    status: 'EXECUTING',
    output: null,
    error: null,
    metadata: { progress: 1 },
    tags: [],
    createdAt: '2026-11-10T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  },
});

describe('useJobRun', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('does not fetch when disabled or without a run id', () => {
    renderHook(() => useJobRun('jrun_1', { enabled: false }), { wrapper });
    renderHook(() => useJobRun(undefined), { wrapper });
    renderHook(() => useJobRun(''), { wrapper });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches the run from the API and exposes metadata', async () => {
    mockGet.mockResolvedValue(runResponse());
    const { result } = renderHook(() => useJobRun('jrun_1'), { wrapper });
    await waitFor(() => expect(result.current.run?.status).toBe('EXECUTING'));
    expect(mockGet).toHaveBeenCalledWith('/v1/job-runs/jrun_1');
    expect(result.current.run?.metadata).toEqual({ progress: 1 });
    expect(result.current.error).toBeUndefined();
  });

  it('polls until the run is terminal, then stops and calls onComplete once', async () => {
    mockGet
      .mockResolvedValueOnce(runResponse())
      .mockResolvedValue(runResponse({ status: 'COMPLETED', output: { downloadUrl: 'https://x' } }));
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useJobRun<{ downloadUrl: string }>('jrun_1', { refreshInterval: 20, onComplete }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.run?.status).toBe('COMPLETED'));
    expect(result.current.run?.output?.downloadUrl).toBe('https://x');
    const callsAtCompletion = mockGet.mock.calls.length;
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(mockGet.mock.calls.length).toBe(callsAtCompletion);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0].status).toBe('COMPLETED');
  });

  it('surfaces API errors (e.g. 404 for another organization) without a run', async () => {
    mockGet.mockResolvedValue({ error: 'Run not found', status: 404 });
    const { result } = renderHook(() => useJobRun('jrun_other'), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe('Run not found'));
    expect(result.current.run).toBeUndefined();
  });

  it.each([
    ['a 429', { error: 'Too Many Requests', status: 429 }],
    ['a 502 during a deploy', { error: 'Bad Gateway', status: 502 }],
  ])('keeps polling through %s without reporting an error', async (_label, failure) => {
    mockGet
      .mockResolvedValueOnce(runResponse())
      .mockResolvedValueOnce(failure)
      .mockResolvedValue(runResponse({ status: 'COMPLETED' }));
    const onComplete = vi.fn();
    const seenErrors: unknown[] = [];
    const { result } = renderHook(
      () => {
        const state = useJobRun('jrun_1', { refreshInterval: 20, onComplete });
        if (state.error) seenErrors.push(state.error);
        return state;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.run?.status).toBe('COMPLETED'));
    expect(seenErrors).toEqual([]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('classifies terminal statuses', () => {
    expect(isJobRunFinished('FAILED')).toBe(true);
    expect(isJobRunFinished('TIMED_OUT')).toBe(true);
    expect(isJobRunFinished('QUEUED')).toBe(false);
    expect(isJobRunFinished(undefined)).toBe(false);
  });
});
