'use client';

import { useJobRun } from '@/hooks/use-job-run';
import { startFileDownload, triggerFrameworkEvidenceExport } from '@/lib/evidence-download';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface EvidenceExportRequest {
  frameworkInstanceId: string;
  frameworkName: string;
  /** Audit period, `YYYY-MM-DD`, inclusive; empty for all time. */
  from?: string;
  to?: string;
  /** An audit of this framework: adds the audit trail and evidence requests. */
  auditId?: string;
}

type ActiveExport = { runId: string; frameworkName: string; toastId: string };

/**
 * The one way to export a framework's evidence ZIP: start the background job,
 * poll it, then download from storage. The requester is also emailed the
 * link, so they can leave the page.
 */
export function useEvidenceExport() {
  const [active, setActive] = useState<ActiveExport | null>(null);

  const fail = (toastId: string) => {
    setActive(null);
    toast.error('Evidence export failed. Please try again.', { id: toastId });
  };

  const { error } = useJobRun<{ downloadUrl?: string }>(active?.runId ?? null, {
    enabled: active !== null,
    onComplete: (run) => {
      if (!active) return;
      const downloadUrl = run.output?.downloadUrl;
      if (run.status !== 'COMPLETED' || !downloadUrl) return fail(active.toastId);
      setActive(null);
      startFileDownload(downloadUrl);
      // The action covers browsers that block a download not started by a click.
      toast.success(`The ${active.frameworkName} evidence ZIP is ready. Your download should start now.`, {
        id: active.toastId,
        duration: 60_000,
        action: { label: 'Download', onClick: () => startFileDownload(downloadUrl) },
      });
    },
  });

  // The run can no longer be read (e.g. 404): stop waiting for it.
  useEffect(() => {
    if (error && active) fail(active.toastId);
  });

  const startExport = async ({ frameworkName, ...request }: EvidenceExportRequest) => {
    const toastId = `evidence-export-${request.frameworkInstanceId}`;
    toast.loading(
      `Preparing the ${frameworkName} evidence ZIP. We'll email you when it's ready, so you can leave this page.`,
      { id: toastId, duration: Infinity },
    );
    try {
      const { runId } = await triggerFrameworkEvidenceExport({
        frameworkInstanceId: request.frameworkInstanceId,
        from: request.from || undefined,
        to: request.to || undefined,
        auditId: request.auditId || undefined,
      });
      setActive({ runId, frameworkName, toastId });
    } catch {
      fail(toastId);
    }
  };

  return { startExport, isExporting: active !== null };
}
