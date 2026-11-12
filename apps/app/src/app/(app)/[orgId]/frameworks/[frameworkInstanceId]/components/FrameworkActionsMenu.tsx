'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useJobRun } from '@/hooks/use-job-run';
import { startFileDownload, triggerFrameworkEvidenceExport } from '@/lib/evidence-download';
import { Button } from '@trycompai/design-system';
import { Download, Edit, OverflowMenuVertical, TrashCan } from '@trycompai/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@trycompai/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function FrameworkActionsMenu({
  frameworkInstanceId,
  frameworkName,
  canEdit,
  onEdit,
  onDelete,
}: {
  frameworkInstanceId: string;
  frameworkName: string;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);

  const canDelete = hasPermission('framework', 'delete');
  // The ZIP bundles policies and evidence, so the API requires read on both.
  const canExport = hasPermission('evidence', 'read') && hasPermission('policy', 'read');

  // The ZIP is built by a background job into storage; the browser then downloads
  // it from there (known size, resumable) once the run finishes.
  const [exportRunId, setExportRunId] = useState<string | null>(null);
  const toastId = `framework-evidence-export-${frameworkInstanceId}`;
  const failExport = () => {
    setExportRunId(null);
    toast.error('Evidence export failed. Please try again.', { id: toastId });
  };

  const { error: runError } = useJobRun<{ downloadUrl?: string }>(exportRunId, {
    enabled: exportRunId !== null,
    onComplete: (run) => {
      const downloadUrl = run.output?.downloadUrl;
      if (run.status !== 'COMPLETED' || !downloadUrl) return failExport();
      setExportRunId(null);
      startFileDownload(downloadUrl);
      // The action covers browsers that block a download not started by a click.
      toast.success(`${frameworkName} evidence ZIP is ready. Your download should start now.`, {
        id: toastId,
        duration: 60_000,
        action: { label: 'Download', onClick: () => startFileDownload(downloadUrl) },
      });
    },
  });

  // The run can no longer be read (e.g. 404): stop waiting for it.
  useEffect(() => {
    if (runError && exportRunId !== null) failExport();
  });

  if (!canEdit && !canDelete && !canExport) return null;

  const handleExport = async () => {
    setOpen(false);
    toast.loading(
      `Preparing the ${frameworkName} evidence ZIP. Keep this page open; the download starts when it is ready.`,
      { id: toastId, duration: Infinity },
    );
    try {
      const { runId } = await triggerFrameworkEvidenceExport({ frameworkInstanceId });
      setExportRunId(runId);
    } catch {
      failExport();
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" aria-label="Framework actions">
          <OverflowMenuVertical size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Edit size={16} className="mr-2" />
            Edit Framework
          </DropdownMenuItem>
        )}
        {canExport && (
          <DropdownMenuItem onClick={handleExport} disabled={exportRunId !== null}>
            <Download size={16} className="mr-2" />
            {exportRunId !== null ? 'Preparing export…' : 'Export all evidences'}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="text-destructive focus:text-destructive"
          >
            <TrashCan size={16} className="mr-2" />
            Delete Framework
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
