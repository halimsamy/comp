'use client';

import { useVendorRegisterActions } from '@/hooks/use-vendor-register';
import type { Vendor } from '@/hooks/use-vendors';
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';
import { previewToUpdates, previewTpspImport, type TpspImportPreview } from '../../lib/tpsp-csv';
import { formatDate } from '../../lib/vendor-tpsp';

const FIELD_LABEL: Record<string, string> = {
  criticality: 'Criticality',
  handlesCardholderData: 'Shares account data',
  affectsCdeSecurity: 'Affects CDE',
  contractStartDate: 'Contract start',
  contractEndDate: 'Contract end',
  securityClausesConfirmed: 'Security clauses',
  confidentialityClausesConfirmed: 'Confidentiality clauses',
  tpspAcknowledgementDate: 'TPSP acknowledgement',
  assuranceType: 'Assurance',
  assuranceExpiresAt: 'Assurance expires',
  pciStatus: 'PCI DSS status',
  pciStatusCheckedAt: 'PCI status checked',
};

const show = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
  return String(value).replace(/_/g, ' ');
};

/**
 * Loads TPSP fields (contract dates, criticality, PCI status, ...) from a
 * spreadsheet export, matched to vendors by name, with a preview of every change.
 */
export function ImportTpspCsvSheet({
  open,
  onOpenChange,
  vendors,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: Vendor[];
}) {
  const { bulkUpdateVendors } = useVendorRegisterActions();
  const [preview, setPreview] = useState<TpspImportPreview | null>(null);
  const [saving, setSaving] = useState(false);

  const handleClose = (next: boolean) => {
    if (!next) setPreview(null);
    onOpenChange(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setPreview(previewTpspImport({ text: await file.text(), vendors }));
  };

  const handleApply = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const updates = previewToUpdates(preview);
      await bulkUpdateVendors(updates);
      toast.success(`${updates.length} vendor${updates.length === 1 ? '' : 's'} updated`);
      handleClose(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Import failed');
    } finally {
      setSaving(false);
    }
  };

  const changes = preview?.matched.length ?? 0;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Import vendor data from CSV</SheetTitle>
          <SheetDescription>
            One row per vendor with a &quot;name&quot; column. Recognized columns: criticality,
            shares account data, affects CDE, contract start / end, security clauses,
            confidentiality clauses, TPSP acknowledgement, assurance type / expires, PCI status, PCI
            status checked. Blank cells are ignored.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="flex flex-col gap-4">
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              className="text-sm"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            {preview?.error && (
              <p role="alert" className="text-sm text-destructive">
                {preview.error}
              </p>
            )}
            {preview && !preview.error && changes === 0 && (
              <p className="text-sm text-muted-foreground">Nothing to change: the file matches.</p>
            )}
            {preview?.matched.map(({ vendor, changes: rows }) => (
              <section key={vendor.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
                <span className="text-sm font-medium">{vendor.name}</span>
                <ul className="flex flex-col gap-0.5 text-xs">
                  {rows.map((change) => (
                    <li key={change.field} className="flex flex-wrap gap-1">
                      <span className="text-muted-foreground">{FIELD_LABEL[change.field]}:</span>
                      <span className="line-through text-muted-foreground">{show(change.from)}</span>
                      <span>→ {show(change.to)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {(preview?.unmatched.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                No vendor named: {preview?.unmatched.join(', ')}. Add them first or fix the name.
              </p>
            )}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={() => handleClose(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleApply()} loading={saving} disabled={changes === 0 || saving}>
            Update {changes} vendor{changes === 1 ? '' : 's'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
