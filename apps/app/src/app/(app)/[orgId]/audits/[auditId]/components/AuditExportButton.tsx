'use client';

import type { Audit } from '@/hooks/use-audits';
import { useJobRun } from '@/hooks/use-job-run';
import { startFileDownload, triggerFrameworkEvidenceExport } from '@/lib/evidence-download';
import { Button } from '@trycompai/design-system';
import { Download } from '@trycompai/design-system/icons';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { toDay } from '../../lib/audit-labels';

/**
 * The framework evidence ZIP for this audit's period: task files valid in the
 * period, automation runs and document submissions inside it.
 */
export function AuditExportButton({ audit }: { audit: Audit }) {
  const [runId, setRunId] = useState<string | null>(null);
  const toastId = `audit-export-${audit.id}`;
  const fail = () => {
    setRunId(null);
    toast.error('Evidence export failed. Please try again.', { id: toastId });
  };

  const { error } = useJobRun<{ downloadUrl?: string }>(runId, {
    enabled: runId !== null,
    onComplete: (run) => {
      const downloadUrl = run.output?.downloadUrl;
      if (run.status !== 'COMPLETED' || !downloadUrl) return fail();
      setRunId(null);
      startFileDownload(downloadUrl);
      toast.success('The audit evidence ZIP is ready. Your download should start now.', {
        id: toastId,
        duration: 60_000,
        action: { label: 'Download', onClick: () => startFileDownload(downloadUrl) },
      });
    },
  });

  useEffect(() => {
    if (error && runId !== null) fail();
  });

  const handleExport = async () => {
    toast.loading('Preparing the audit evidence ZIP. Keep this page open.', {
      id: toastId,
      duration: Infinity,
    });
    try {
      const { runId: id } = await triggerFrameworkEvidenceExport({
        frameworkInstanceId: audit.frameworkInstanceId,
        from: toDay(audit.periodStart),
        to: toDay(audit.periodEnd),
      });
      setRunId(id);
    } catch {
      fail();
    }
  };

  return (
    <Button
      variant="outline"
      iconLeft={<Download size={16} />}
      loading={runId !== null}
      onClick={() => void handleExport()}
    >
      Export evidence
    </Button>
  );
}
