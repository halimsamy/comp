'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { downloadFrameworkEvidenceZip } from '@/lib/evidence-download';
import { Button } from '@trycompai/design-system';
import { Download, Edit, OverflowMenuVertical, TrashCan } from '@trycompai/design-system/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@trycompai/ui/dropdown-menu';
import { useState } from 'react';
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
  const [isExporting, setIsExporting] = useState(false);

  const canDelete = hasPermission('framework', 'delete');
  // The ZIP bundles policies and evidence, so the API requires read on both.
  const canExport = hasPermission('evidence', 'read') && hasPermission('policy', 'read');

  if (!canEdit && !canDelete && !canExport) return null;

  const handleExport = async () => {
    setOpen(false);
    setIsExporting(true);
    const toastId = toast.loading('Preparing evidence export…');
    try {
      await downloadFrameworkEvidenceZip({ frameworkInstanceId, frameworkName });
      toast.success('Evidence export downloaded', { id: toastId });
    } catch (error) {
      console.error('Framework evidence export failed:', error);
      toast.error('Failed to export evidence. Please try again.', { id: toastId });
    } finally {
      setIsExporting(false);
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
          <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
            <Download size={16} className="mr-2" />
            Export all evidences
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
