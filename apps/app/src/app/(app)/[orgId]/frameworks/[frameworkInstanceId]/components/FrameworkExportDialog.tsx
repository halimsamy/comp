'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@trycompai/design-system';
import { Checkmark } from '@trycompai/design-system/icons';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const periodSchema = z
  .object({ from: z.string(), to: z.string() })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: 'The period must start before it ends',
    path: ['to'],
  });

export type ExportPeriod = z.infer<typeof periodSchema>;

const INCLUDED = [
  'Policies, tasks and document submissions per requirement',
  'Published ISMS documents and the Statement of Applicability',
  'Risk, vendor, people, device, offboarding and findings registers you can read',
];

/** Confirms a framework evidence export and collects an optional audit period. */
export function FrameworkExportDialog({
  open,
  onOpenChange,
  frameworkName,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameworkName: string;
  onExport: (period: ExportPeriod) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExportPeriod>({
    resolver: zodResolver(periodSchema),
    defaultValues: { from: '', to: '' },
  });

  const handleExport = handleSubmit((period) => onExport(period));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleExport}>
          <DialogHeader>
            <DialogTitle>Export {frameworkName} evidence</DialogTitle>
            <DialogDescription>
              One folder per requirement, ready to hand to your auditor.
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

          <fieldset className="mb-4 space-y-2">
            <legend className="text-sm font-medium">Audit period (optional)</legend>
            <p className="text-xs text-muted-foreground">
              Leave empty to export everything. Registers are always a snapshot of today.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="export-from">From</Label>
                <Input id="export-from" type="date" {...register('from')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="export-to">To</Label>
                <Input id="export-to" type="date" {...register('to')} />
              </div>
            </div>
            {errors.to?.message ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.to.message}
              </p>
            ) : null}
          </fieldset>

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
