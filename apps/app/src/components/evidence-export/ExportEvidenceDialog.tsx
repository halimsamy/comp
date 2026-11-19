'use client';

import type { Audit } from '@/hooks/use-audits';
import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';
import { Checkmark } from '@trycompai/design-system/icons';
import { format, subMonths } from 'date-fns';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import useSWR from 'swr';
import { z } from 'zod';
import { DateRangeField } from './DateRangeField';

const exportSchema = z
  .object({
    frameworkInstanceId: z.string().min(1, 'Pick a framework'),
    from: z.string(),
    to: z.string(),
    auditId: z.string(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: 'The period must start before it ends',
    path: ['to'],
  });

export type EvidenceExportValues = z.infer<typeof exportSchema>;

const INCLUDED = [
  'Applicability, approved policies, tasks and documents per requirement',
  'Published ISMS documents, the Statement of Applicability and compensating controls worksheets',
  'Registers you can read: risks, vendors, people, access reviews, training and findings',
  'For an audit: the audit trail and every evidence request with its response',
];

const day = (value: string) => value.slice(0, 10);

async function fetchAudits(key: string): Promise<Audit[]> {
  const res = await apiClient.get<{ data: Audit[] }>(key);
  if (res.error) throw new Error(res.error);
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

/**
 * The single evidence export dialog: framework, audit period ("All time" when
 * empty) and presets (last 12 months, each open audit of the framework).
 */
export function ExportEvidenceDialog({
  open,
  onOpenChange,
  frameworks,
  defaultValues,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameworks: Array<{ id: string; name: string }>;
  defaultValues?: Partial<EvidenceExportValues>;
  onExport: (values: EvidenceExportValues & { frameworkName: string }) => void;
}) {
  const { hasPermission } = usePermissions();
  const canReadAudits = hasPermission('audit', 'read');
  // Same key as useAudits, so an audits page visit is reused.
  const { data: audits } = useSWR(open && canReadAudits ? '/v1/audits' : null, fetchAudits, {
    revalidateOnFocus: false,
  });

  const initial = {
    frameworkInstanceId: frameworks[0]?.id ?? '',
    from: '',
    to: '',
    auditId: '',
    ...defaultValues,
  };
  const { control, handleSubmit, reset, setValue, watch, formState } = useForm<EvidenceExportValues>({
    resolver: zodResolver(exportSchema),
    defaultValues: initial,
  });
  // Each opening starts from the caller's defaults.
  useEffect(() => {
    if (open) reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const values = watch();
  const openAudits = (Array.isArray(audits) ? audits : []).filter(
    (a) => a.status !== 'completed' && a.frameworkInstanceId === values.frameworkInstanceId,
  );
  const applyPreset = ({ from, to, auditId }: { from: string; to: string; auditId: string }) => {
    setValue('from', from);
    setValue('to', to);
    setValue('auditId', auditId);
  };
  const today = new Date();
  const lastYear = { from: format(subMonths(today, 12), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };

  const handleExport = handleSubmit((submitted) =>
    onExport({
      ...submitted,
      frameworkName: frameworks.find((f) => f.id === submitted.frameworkInstanceId)?.name ?? 'Framework',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleExport}>
          <DialogHeader>
            <DialogTitle>Export evidence</DialogTitle>
            <DialogDescription>
              One folder per requirement, ready to hand to your auditor. We&apos;ll email you the
              download link when it&apos;s ready.
            </DialogDescription>
          </DialogHeader>

          <ul className="my-4 space-y-1.5 text-sm text-muted-foreground">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 shrink-0 text-primary">
                  <Checkmark size={14} />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mb-4 flex flex-col gap-4">
            {frameworks.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="export-framework">Framework</Label>
                <Controller
                  control={control}
                  name="frameworkInstanceId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value ?? '');
                        setValue('auditId', '');
                      }}
                    >
                      <SelectTrigger id="export-framework" aria-label="Framework">
                        <SelectValue>
                          {(value: string) => frameworks.find((f) => f.id === value)?.name ?? 'Pick a framework'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {frameworks.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-period">Audit period</Label>
              <DateRangeField
                id="export-period"
                from={values.from}
                to={values.to}
                onChange={({ from, to }) => applyPreset({ from, to, auditId: '' })}
              />
              <div className="flex flex-wrap gap-2" role="group" aria-label="Period presets">
                <Button
                  type="button"
                  size="sm"
                  variant={values.from === lastYear.from && values.to === lastYear.to ? 'secondary' : 'outline'}
                  onClick={() => applyPreset({ ...lastYear, auditId: '' })}
                >
                  Last 12 months
                </Button>
                {openAudits.map((audit) => (
                  <Button
                    key={audit.id}
                    type="button"
                    size="sm"
                    variant={values.auditId === audit.id ? 'secondary' : 'outline'}
                    onClick={() =>
                      applyPreset({ from: day(audit.periodStart), to: day(audit.periodEnd), auditId: audit.id })
                    }
                  >
                    {audit.title}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {values.auditId
                  ? 'Includes the audit trail and evidence requests of this audit.'
                  : 'Registers are always a snapshot of today.'}
              </p>
              {formState.errors.to?.message ? (
                <p role="alert" className="text-xs text-destructive">
                  {formState.errors.to.message}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Export ZIP</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
