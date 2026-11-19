'use client';

import { ExportEvidenceDialog } from '@/components/evidence-export/ExportEvidenceDialog';
import { useEvidenceExport } from '@/hooks/use-evidence-export';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@trycompai/design-system';
import { Download } from '@trycompai/design-system/icons';
import { useState } from 'react';
import type { FrameworkInstanceForTasks } from '../types';

/**
 * The Evidence page export (#192): the same framework ZIP dialog as the
 * framework and audit pages, instead of a flat per-task dump.
 */
export function EvidenceExportButton({ frameworkInstances }: { frameworkInstances: FrameworkInstanceForTasks[] }) {
  const { hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);
  const { startExport, isExporting } = useEvidenceExport();
  // The ZIP bundles policies and evidence, so the API requires read on both.
  const canExport = hasPermission('evidence', 'read') && hasPermission('policy', 'read');
  const frameworks = frameworkInstances.map((fw) => ({
    id: fw.id,
    name: fw.framework?.name ?? fw.customFramework?.name ?? 'Framework',
  }));
  if (!canExport || frameworks.length === 0) return null;

  return (
    <>
      <Button variant="outline" iconLeft={<Download size={16} />} loading={isExporting} onClick={() => setOpen(true)}>
        Export evidence
      </Button>
      <ExportEvidenceDialog
        open={open}
        onOpenChange={setOpen}
        frameworks={frameworks}
        onExport={(values) => {
          setOpen(false);
          void startExport(values);
        }}
      />
    </>
  );
}
