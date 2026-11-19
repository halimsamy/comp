'use client';

import type { ImportResult, ImportVulnerabilitiesPayload } from '@/hooks/use-vulnerabilities';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  Input,
  Label,
  Stack,
  Text,
} from '@trycompai/design-system';
import { format } from 'date-fns';
import type { ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { importScanSchema, type ImportScanValues } from '../lib/vulnerability-import-schema';
import { FormSelect } from './FormSelect';

const SOURCES = [
  { value: 'asv_scan', label: 'External ASV scan (PCI DSS 11.3.2)' },
  { value: 'internal_scan', label: 'Internal scan (PCI DSS 11.3.1)' },
  { value: 'pentest', label: 'Penetration test (PCI DSS 11.4)' },
];
const VERDICTS = [
  { value: 'auto', label: 'From the findings' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
];

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError>{error}</FieldError>
    </Stack>
  );
}

const defaults = (): ImportScanValues => ({
  source: 'asv_scan',
  scannedAt: format(new Date(), 'yyyy-MM-dd'),
  vendor: '',
  verdict: 'auto',
  resolveMissing: false,
  file: undefined,
  report: undefined,
});

/** Record one scan or test: its date, vendor, verdict and report, plus the findings CSV. */
export function ImportVulnerabilitiesDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (payload: ImportVulnerabilitiesPayload) => Promise<ImportResult | undefined>;
}) {
  const form = useForm<ImportScanValues>({
    resolver: zodResolver(importScanSchema),
    defaultValues: defaults(),
  });
  const source = useWatch({ control: form.control, name: 'source' });

  const handleImport = form.handleSubmit(async (values) => {
    if (!values.file) return;
    try {
      const result = await onImport({
        source: values.source,
        csv: await values.file.text(),
        resolveMissing: values.resolveMissing,
        scannedAt: values.scannedAt,
        vendor: values.vendor.trim() || undefined,
        passed: values.verdict === 'auto' ? undefined : values.verdict === 'passed',
        report: values.report,
      });
      const verdict =
        result?.passed === true ? 'passed' : result?.passed === false ? 'failed' : 'recorded';
      toast.success(
        `Scan ${verdict}: ${result?.created ?? 0} new, ${result?.updated ?? 0} updated, ${result?.reopened ?? 0} reopened, ${result?.resolved ?? 0} resolved findings`,
      );
      form.reset(defaults());
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a scan or test</DialogTitle>
          <DialogDescription>
            Upload the CSV export (Qualys, Tenable, Nessus or any file with title, severity and host
            columns) and the report. Findings link to assets by IP, DNS name or host; unknown hosts
            are added to the inventory. Re-importing a rescan updates the same findings.
          </DialogDescription>
        </DialogHeader>
        <form id="import-scan-form" onSubmit={(event) => void handleImport(event)}>
          <Stack gap="4">
            <FormSelect control={form.control} name="source" label="Scan type" options={SOURCES} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="scannedAt"
                render={({ field: { ref: _ref, ...field }, fieldState }) => (
                  <Field id="scan-date" label="Scan date" error={fieldState.error?.message}>
                    <Input {...field} id="scan-date" type="date" />
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="vendor"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Field id="scan-vendor" label="Vendor / tester">
                    <Input {...field} id="scan-vendor" placeholder="e.g. Qualys (ASV)" />
                  </Field>
                )}
              />
            </div>
            {source !== 'pentest' ? (
              <FormSelect control={form.control} name="verdict" label="Result" options={VERDICTS} />
            ) : null}
            <Controller
              control={form.control}
              name="file"
              render={({ field, fieldState }) => (
                <Field id="scan-csv" label="Findings CSV" error={fieldState.error?.message}>
                  <Input
                    id="scan-csv"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => field.onChange(event.target.files?.[0])}
                  />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="report"
              render={({ field, fieldState }) => (
                <Field
                  id="scan-report"
                  label="Report (PDF, optional)"
                  error={fieldState.error?.message}
                >
                  <Input
                    id="scan-report"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(event) => field.onChange(event.target.files?.[0])}
                  />
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="resolveMissing"
              render={({ field }) => (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="vuln-import-resolve"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <Label htmlFor="vuln-import-resolve">
                    <Text size="sm">
                      This is a rescan: resolve open findings of this type that are not in this file
                    </Text>
                  </Label>
                </div>
              )}
            />
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="import-scan-form" loading={form.formState.isSubmitting}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
