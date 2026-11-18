'use client';

import type { RiskReviewTrigger } from '@/hooks/use-risk-workspace';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { memberLabel, type WorkspaceMember } from './workspace-types';

export const TRIGGER_LABEL: Record<RiskReviewTrigger, string> = {
  scheduled: 'Scheduled review',
  significant_change: 'Significant change',
};

const reviewSchema = z
  .object({
    trigger: z.enum(['scheduled', 'significant_change']),
    reviewedById: z.string(),
    notes: z.string().max(5000),
  })
  .refine((values) => values.trigger === 'scheduled' || values.notes.trim().length > 0, {
    message: 'Describe the change that triggered this review',
    path: ['notes'],
  });
export type RiskReviewValues = z.infer<typeof reviewSchema>;

// Empty reviewer means "the signed-in member" (the API defaults to the caller).
const defaults: RiskReviewValues = { trigger: 'scheduled', reviewedById: '', notes: '' };

const CHECKS = [
  'Every risk still applies and new risks are added (vendors, systems, changes)',
  'Inherent and residual ratings reflect the current controls',
  'Each risk has an owner and a treatment decision',
  'Residual risks above the acceptance threshold are accepted by their owner',
  'Overdue treatment actions are followed up',
];

/** Sign off a periodic review of the whole register (ISO 27001 8.2). */
export function RecordRiskReviewSheet({
  open,
  members,
  onOpenChange,
  onRecord,
}: {
  open: boolean;
  members: WorkspaceMember[];
  onOpenChange: (open: boolean) => void;
  onRecord: (values: RiskReviewValues) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<RiskReviewValues>({ resolver: zodResolver(reviewSchema), defaultValues: defaults });

  const handleClose = (next: boolean) => {
    if (!next) reset(defaults);
    onOpenChange(next);
  };

  const handleRecord = handleSubmit(async (values) => {
    await onRecord(values);
    handleClose(false);
  });

  const reviewerLabel = (id: string) => {
    const member = members.find((candidate) => candidate.id === id);
    return member ? memberLabel(member) : 'You';
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Record risk review</SheetTitle>
          <SheetDescription>
            Signing off freezes the register as it stands now and schedules the next review.
            Reviews cannot be edited afterwards.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="risk-review-form" onSubmit={handleRecord} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
              <span className="text-sm font-medium">Before you sign off, check that</span>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {CHECKS.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Why are you reviewing?</legend>
              <Controller
                control={control}
                name="trigger"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={(value) => field.onChange(value)}>
                    {(Object.keys(TRIGGER_LABEL) as RiskReviewTrigger[]).map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {TRIGGER_LABEL[value]}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
            </fieldset>
            <div className="flex flex-col gap-2">
              <Label htmlFor="risk-review-reviewer">Signed off by</Label>
              <Controller
                control={control}
                name="reviewedById"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => field.onChange(value ?? '')}>
                    <SelectTrigger id="risk-review-reviewer" aria-label="Signed off by">
                      <SelectValue placeholder="You">
                        {(value: string) => (value ? reviewerLabel(value) : 'You')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {memberLabel(member)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="risk-review-notes">Findings and decisions</Label>
              <Controller
                control={control}
                name="notes"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Textarea
                    {...field}
                    id="risk-review-notes"
                    rows={5}
                    placeholder="Risks added or retired, ratings changed, follow-ups…"
                  />
                )}
              />
              {errors.notes && (
                <span role="alert" className="text-xs text-destructive">
                  {errors.notes.message}
                </span>
              )}
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
          <Button type="submit" form="risk-review-form" loading={isSubmitting} disabled={isSubmitting}>
            Sign off review
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
