'use client';

import { Button } from '@trycompai/design-system';
import { Upload } from '@trycompai/design-system/icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { NonconformityPayload } from '../hooks/useNonconformities';
import type { ApproverOption } from './IsmsApprovalSection';
import { parseNonconformityCsv } from './nonconformity-csv';

/** Bring an existing nonconformity log (spreadsheet) into 10.2 (#171). */
export function ImportNonconformitiesButton({
  memberOptions,
  onImport,
}: {
  memberOptions: ApproverOption[];
  onImport: (rows: NonconformityPayload[]) => Promise<number>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setIsImporting(true);
    try {
      const { rows, errors } = parseNonconformityCsv({ text: await file.text(), members: memberOptions });
      if (errors.length > 0) {
        toast.error(`Nothing imported. ${errors.slice(0, 3).join('. ')}${errors.length > 3 ? '…' : ''}`);
        return;
      }
      if (rows.length === 0) {
        toast.error('The file has no nonconformities');
        return;
      }
      const count = await onImport(rows);
      toast.success(`Imported ${count} nonconformit${count === 1 ? 'y' : 'ies'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="Nonconformity log CSV"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        iconLeft={<Upload size={16} />}
        loading={isImporting}
        onClick={() => input.current?.click()}
      >
        Import CSV
      </Button>
    </>
  );
}
