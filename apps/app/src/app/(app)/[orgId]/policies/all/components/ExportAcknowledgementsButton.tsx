'use client';

import { downloadAcknowledgementsCsv } from '@/hooks/use-policy-lifecycle';
import { Button } from '@trycompai/design-system';
import { DocumentExport } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';

/** Org-wide CSV of every policy acknowledgement, for auditors. */
export function ExportAcknowledgementsButton() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadAcknowledgementsCsv({});
    } catch {
      toast.error('Failed to export acknowledgements');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      iconLeft={<DocumentExport size={14} />}
      loading={isExporting}
      onClick={handleExport}
    >
      Export acknowledgements
    </Button>
  );
}
