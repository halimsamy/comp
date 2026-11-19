'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { Button, Section, Text } from '@trycompai/design-system';
import { Download, Upload } from '@trycompai/design-system/icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { buildTrainingRecordsCsv, parseTrainingImportCsv, type TrainingRecordRow } from '../lib/training-records-csv';

const saveCsv = (csv: string) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `training-records-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

/** #94: bring in training taken elsewhere (CSV) and export every completion for auditors. */
export function TrainingRecordsSettings() {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('training', 'read');
  const canUpdate = hasPermission('training', 'update');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'import' | 'export' | null>(null);

  const handleExport = async () => {
    setBusy('export');
    const response = await api.get<{ data: TrainingRecordRow[] }>('/v1/training/records');
    setBusy(null);
    if (response.error || !Array.isArray(response.data?.data)) {
      toast.error(response.error ?? 'Failed to export training records');
      return;
    }
    saveCsv(buildTrainingRecordsCsv(response.data.data));
  };

  const handleImport = async (file: File) => {
    const { rows, errors } = parseTrainingImportCsv(await file.text());
    if (rows.length === 0) {
      toast.error(errors[0] ?? 'The file has no rows');
      return;
    }
    setBusy('import');
    const response = await api.post<{ imported: number; errors: string[] }>('/v1/training/records/import', { rows });
    setBusy(null);
    if (response.error || !response.data) {
      toast.error(response.error ?? 'Failed to import training records');
      return;
    }
    const skipped = errors.length + response.data.errors.length;
    toast.success(`${response.data.imported} records imported${skipped ? `, ${skipped} skipped` : ''}`);
  };

  if (!canRead) return null;

  return (
    <Section title="Training records">
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <Text size="sm" variant="muted">
            Import training taken outside the portal from a CSV with Email, Training and Completed columns. Export
            every completion with its date, expiry and source for auditors.
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpdate && (
            <Button
              variant="outline"
              iconLeft={<Upload size={16} />}
              loading={busy === 'import'}
              onClick={() => fileRef.current?.click()}
            >
              Import CSV
            </Button>
          )}
          <Button variant="outline" iconLeft={<Download size={16} />} loading={busy === 'export'} onClick={() => void handleExport()}>
            Export CSV
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="Training records CSV"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleImport(file);
          }}
        />
      </div>
    </Section>
  );
}
