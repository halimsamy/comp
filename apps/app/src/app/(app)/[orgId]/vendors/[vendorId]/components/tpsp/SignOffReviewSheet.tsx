'use client';

import type { SignOffVendorReviewInput } from '@/hooks/use-vendor-tpsp';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@trycompai/design-system';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { REVIEW_OUTCOME } from '../../../lib/vendor-tpsp';

const CHECKLIST = [
  {
    name: 'assuranceReviewed',
    label: 'Reviewed the current SOC 2 / ISO certificate / AOC, its exceptions and our CUECs',
  },
  {
    name: 'pciStatusConfirmed',
    label: 'Confirmed the vendor’s PCI DSS compliance status (12.8.4)',
  },
  { name: 'contractReviewed', label: 'Contract, security and confidentiality clauses still valid' },
  { name: 'riskReassessed', label: 'Inherent and residual risk re-assessed' },
] as const;

const reviewSchema = z
  .object({
    outcome: z.enum(['approved', 'approved_with_conditions', 'rejected']),
    assuranceReviewed: z.boolean(),
    pciStatusConfirmed: z.boolean(),
    contractReviewed: z.boolean(),
    riskReassessed: z.boolean(),
    notes: z.string().max(10_000),
    nextReviewDue: z.string(),
  })
  .refine((v) => v.outcome === 'approved' || v.notes.trim().length > 0, {
    message: 'Describe the conditions or the reason for rejection',
    path: ['notes'],
  });
type ReviewValues = z.infer<typeof reviewSchema>;

const DEFAULTS: ReviewValues = {
  outcome: 'approved',
  assuranceReviewed: false,
  pciStatusConfirmed: false,
  contractReviewed: false,
  riskReassessed: false,
  notes: '',
  nextReviewDue: '',
};

/** Sign-off form for a periodic vendor review (ISO 27001 A.5.22, PCI DSS 12.8.4). */
export function SignOffReviewSheet({
  open,
  onOpenChange,
  cadenceLabel,
  onSignOff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cadenceLabel: string;
  onSignOff: (input: SignOffVendorReviewInput) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: DEFAULTS,
  });

  const handleClose = (next: boolean) => {
    if (!next) reset(DEFAULTS);
    onOpenChange(next);
  };

  const handleSignOff = handleSubmit(async (values) => {
    await onSignOff({
      outcome: values.outcome,
      checklist: {
        assuranceReviewed: values.assuranceReviewed,
        pciStatusConfirmed: values.pciStatusConfirmed,
        contractReviewed: values.contractReviewed,
        riskReassessed: values.riskReassessed,
      },
      notes: values.notes.trim() || undefined,
      nextReviewDue: values.nextReviewDue
        ? new Date(values.nextReviewDue).toISOString()
        : undefined,
    });
    handleClose(false);
  });

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sign off vendor review</SheetTitle>
          <SheetDescription>
            Your name and the date are recorded. Reviews cannot be edited afterwards.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="vendor-review-form" onSubmit={handleSignOff} className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">What did you check?</legend>
              {CHECKLIST.map((item) => (
                <Controller
                  key={item.name}
                  control={control}
                  name={item.name}
                  render={({ field }) => (
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                      />
                      <span>{item.label}</span>
                    </label>
                  )}
                />
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Outcome</legend>
              <Controller
                control={control}
                name="outcome"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={(value) => field.onChange(value)}>
                    {Object.entries(REVIEW_OUTCOME).map(([value, { label }]) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {label}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
            </fieldset>
            <div className="flex flex-col gap-2">
              <Label htmlFor="vendor-review-notes">Notes</Label>
              <Controller
                control={control}
                name="notes"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Textarea
                    {...field}
                    id="vendor-review-notes"
                    rows={4}
                    placeholder="Conditions, follow-ups, CUECs mapped to our controls…"
                  />
                )}
              />
              {errors.notes && (
                <span role="alert" className="text-xs text-destructive">
                  {errors.notes.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="vendor-review-next">Next review (optional)</Label>
              <Controller
                control={control}
                name="nextReviewDue"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Input {...field} id="vendor-review-next" type="date" />
                )}
              />
              <span className="text-xs text-muted-foreground">
                Leave empty to use the {cadenceLabel} cadence.
              </span>
            </div>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="vendor-review-form"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Sign off review
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
