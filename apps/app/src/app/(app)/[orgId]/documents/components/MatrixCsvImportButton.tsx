'use client';

import { Button } from '@trycompai/design-system';
import { Upload } from '@trycompai/design-system/icons';
import { useRef } from 'react';
import { toast } from 'sonner';
import { parseMatrixCsv } from './matrix-csv';
import type { MatrixColumnDefinition, MatrixRowValue } from './submission-utils';

/** "Import CSV into rows" on a matrix field: replaces the rows with the file's rows. */
export function MatrixCsvImportButton({
  columns,
  onImport,
}: {
  columns: ReadonlyArray<MatrixColumnDefinition>;
  onImport: (rows: MatrixRowValue[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const rows = parseMatrixCsv({ csv: await file.text(), columns });
      if (rows.length === 0) {
        toast.error('The CSV has no rows below its header.');
        return;
      }
      onImport(rows);
      toast.success(`Imported ${rows.length} row${rows.length === 1 ? '' : 's'}. Check them before you submit.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the CSV');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="CSV file to import"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <Button type="button" variant="outline" iconLeft={<Upload size={16} />} onClick={() => inputRef.current?.click()}>
        Import CSV into rows
      </Button>
    </>
  );
}
