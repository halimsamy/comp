import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
}));

import { useTaskNativeEvidence } from './use-task-native-evidence';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

describe('useTaskNativeEvidence', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('loads the live status of the task rule', async () => {
    mockGet.mockResolvedValue({ data: { data: { module: 'ISMS', holds: true } } });
    const { result } = renderHook(() => useTaskNativeEvidence({ taskId: 'tsk_1' }), { wrapper });
    await waitFor(() => expect(result.current.evidence).toEqual({ module: 'ISMS', holds: true }));
    expect(mockGet).toHaveBeenCalledWith('/v1/tasks/tsk_1/native-evidence');
  });

  it('returns null for tasks without a rule', async () => {
    mockGet.mockResolvedValue({ data: { data: null } });
    const { result } = renderHook(() => useTaskNativeEvidence({ taskId: 'tsk_1' }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.evidence).toBeNull();
  });

  it('submits and surfaces API errors', async () => {
    mockGet.mockResolvedValue({ data: { data: null } });
    mockPost.mockResolvedValueOnce({ data: { outcome: 'submitted' } });
    const { result } = renderHook(() => useTaskNativeEvidence({ taskId: 'tsk_1' }), { wrapper });
    await act(async () => {
      expect(await result.current.submit()).toEqual({ outcome: 'submitted' });
    });
    expect(mockPost).toHaveBeenCalledWith('/v1/tasks/tsk_1/native-evidence/submit', {});

    mockPost.mockResolvedValueOnce({ error: 'Forbidden' });
    await act(async () => {
      await expect(result.current.submit()).rejects.toThrow('Forbidden');
    });
  });
});
