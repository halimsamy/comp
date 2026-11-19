import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTrigger = vi.fn();
const mockDownload = vi.fn();
const mockToast = vi.hoisted(() => ({ loading: vi.fn(), success: vi.fn(), error: vi.fn() }));

type RunResult = { status: string; output?: { downloadUrl?: string } | null };
const jobRun = vi.hoisted(() => ({
  runId: null as string | null,
  enabled: false,
  error: undefined as Error | undefined,
  onComplete: undefined as ((run: RunResult) => void) | undefined,
}));
vi.mock('@/hooks/use-job-run', () => ({
  useJobRun: (
    runId: string | null,
    options: { enabled: boolean; onComplete?: (run: RunResult) => void },
  ) => {
    jobRun.runId = runId;
    jobRun.enabled = options.enabled;
    jobRun.onComplete = options.onComplete;
    return { run: undefined, error: jobRun.error, isLoading: false };
  },
}));
vi.mock('@/lib/evidence-download', () => ({
  triggerFrameworkEvidenceExport: (...args: unknown[]) => mockTrigger(...args),
  startFileDownload: (...args: unknown[]) => mockDownload(...args),
}));
vi.mock('sonner', () => ({ toast: mockToast }));

import { useEvidenceExport } from './use-evidence-export';

const request = {
  frameworkInstanceId: 'frm_1',
  frameworkName: 'ISO 27001',
  from: '2026-01-01',
  to: '',
  auditId: 'aud_1',
};

async function started() {
  mockTrigger.mockResolvedValue({ runId: 'jrun_1' });
  const hook = renderHook(() => useEvidenceExport());
  await act(() => hook.result.current.startExport(request));
  return hook;
}

describe('useEvidenceExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobRun.error = undefined;
  });

  it('starts the job, tells the user they will be emailed, and polls the run', async () => {
    const { result } = await started();

    expect(mockTrigger).toHaveBeenCalledWith({
      frameworkInstanceId: 'frm_1',
      from: '2026-01-01',
      to: undefined,
      auditId: 'aud_1',
    });
    expect(mockToast.loading).toHaveBeenCalledWith(
      expect.stringContaining("We'll email you when it's ready"),
      expect.objectContaining({ id: 'evidence-export-frm_1' }),
    );
    expect(jobRun).toMatchObject({ runId: 'jrun_1', enabled: true });
    expect(result.current.isExporting).toBe(true);
  });

  it('downloads the ZIP once the run completes and stops polling', async () => {
    const { result } = await started();

    act(() => jobRun.onComplete?.({ status: 'COMPLETED', output: { downloadUrl: 'https://s3/x.zip' } }));

    expect(mockDownload).toHaveBeenCalledWith('https://s3/x.zip');
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining('ISO 27001'),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Download' }) }),
    );
    expect(result.current.isExporting).toBe(false);
    expect(jobRun).toMatchObject({ runId: null, enabled: false });
  });

  it('reports a failed run instead of downloading', async () => {
    const { result } = await started();

    act(() => jobRun.onComplete?.({ status: 'FAILED', output: null }));

    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('stops waiting when the run can no longer be read', async () => {
    const hook = await started();

    jobRun.error = new Error('Run not found');
    hook.rerender();

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
    expect(hook.result.current.isExporting).toBe(false);
  });

  it('reports an export that could not be started', async () => {
    mockTrigger.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEvidenceExport());

    await act(() => result.current.startExport(request));

    expect(mockToast.error).toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });
});
