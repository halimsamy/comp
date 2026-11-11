'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { startFrameworkEvidenceDownload } from '@/lib/evidence-download';
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

  const canDelete = hasPermission('framework', 'delete');
  // The ZIP bundles policies and evidence, so the API requires read on both.
  const canExport = hasPermission('evidence', 'read') && hasPermission('policy', 'read');

  if (!canEdit && !canDelete && !canExport) return null;

  const handleExport = () => {
    setOpen(false);
    startFrameworkEvidenceDownload({ frameworkInstanceId });
    toast.info(
      `Exporting ${frameworkName} evidence. The ZIP downloads as it is built; large frameworks take a few minutes.`,
    );
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
          <DropdownMenuItem onClick={handleExport}>
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
