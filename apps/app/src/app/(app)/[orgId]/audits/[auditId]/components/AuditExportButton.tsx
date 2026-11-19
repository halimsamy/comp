'use client';

import { ExportEvidenceDialog } from '@/components/evidence-export/ExportEvidenceDialog';
import type { Audit } from '@/hooks/use-audits';
import { useEvidenceExport } from '@/hooks/use-evidence-export';
import { Button } from '@trycompai/design-system';
import { Download } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toDay } from '../../lib/audit-labels';

/**
 * The audit's evidence ZIP: the shared export dialog preset to this audit's
 * framework and period, adding the audit trail and evidence requests.
 */
export function AuditExportButton({ audit }: { audit: Audit }) {
  const [open, setOpen] = useState(false);
  const { startExport, isExporting } = useEvidenceExport();

  return (
    <>
      <Button
        variant="outline"
        iconLeft={<Download size={16} />}
        loading={isExporting}
        onClick={() => setOpen(true)}
      >
        Export evidence
      </Button>
      <ExportEvidenceDialog
        open={open}
        onOpenChange={setOpen}
        frameworks={[{ id: audit.frameworkInstanceId, name: audit.frameworkName }]}
        defaultValues={{
          frameworkInstanceId: audit.frameworkInstanceId,
          from: toDay(audit.periodStart),
          to: toDay(audit.periodEnd),
          auditId: audit.id,
        }}
        onExport={(values) => {
          setOpen(false);
          void startExport(values);
        }}
      />
    </>
  );
}
