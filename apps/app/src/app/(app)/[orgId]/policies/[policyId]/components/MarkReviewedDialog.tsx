'use client';

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
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  defaultNextReviewDate,
  isSameDay,
  reviewDateToIso,
} from '../lib/policy-lifecycle-state';

const reviewSchema = z.object({
  notes: z.string().max(5000).optional(),
  requireReacknowledgement: z.boolean(),
  nextReviewDate: z
    .string()
    .min(1, 'Pick the next review date')
    .refine((value) => new Date(`${value}T00:00:00`) > new Date(), {
      message: 'The next review must be in the future',
    }),
});

type ReviewFormValues = z.infer<typeof reviewSchema>;

interface MarkReviewedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frequency: string | null;
  versionLabel: string;
  /** Last recorded review, to warn before a same-day duplicate. */
  lastReviewedAt?: string | null;
  onSubmit: (input: {
    notes?: string;
    nextReviewDate: string;
    requireReacknowledgement: boolean;
  }) => Promise<unknown>;
}

export function MarkReviewedDialog({
  open,
  onOpenChange,
  frequency,
  versionLabel,
  lastReviewedAt,
  onSubmit,
}: MarkReviewedDialogProps) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      notes: '',
      nextReviewDate: defaultNextReviewDate({ frequency }),
      requireReacknowledgement: false,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        notes: '',
        nextReviewDate: defaultNextReviewDate({ frequency }),
        requireReacknowledgement: false,
      });
    }
  }, [open, frequency, reset]);

  const handleReviewSubmit = async (values: ReviewFormValues) => {
    try {
      await onSubmit({
        notes: values.notes?.trim() || undefined,
        // UTC midnight: the local-midnight ISO string shifted the date a day early east of UTC.
        nextReviewDate: reviewDateToIso(values.nextReviewDate),
        requireReacknowledgement: values.requireReacknowledgement,
      });
      toast.success(
        values.requireReacknowledgement
          ? 'Review recorded. Employees must acknowledge the policy again.'
          : 'Review recorded. Acknowledgements were kept.',
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record review');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(handleReviewSubmit)}>
          <Stack gap="md">
            <DialogHeader>
              <DialogTitle>Mark policy as reviewed</DialogTitle>
              <DialogDescription>
                Confirm {versionLabel} is still accurate. The content and version stay as they
                are.
              </DialogDescription>
            </DialogHeader>
            {isSameDay(lastReviewedAt) && (
              <Text size="sm" variant="warning">
                A review was already recorded today. Only record another one if this is a
                separate review.
              </Text>
            )}
            <Stack gap="2">
              <Label htmlFor="review-notes">Review notes (optional)</Label>
              <Textarea
                id="review-notes"
                size="full"
                placeholder="What did you check? e.g. reviewed against current access control procedures, no changes needed."
                {...register('notes')}
              />
            </Stack>
            <Stack gap="2">
              <Label htmlFor="next-review-date">Next review due</Label>
              <Input
                id="next-review-date"
                type="date"
                aria-invalid={Boolean(errors.nextReviewDate)}
                {...register('nextReviewDate')}
              />
              {errors.nextReviewDate && (
                <Text size="sm" variant="destructive">
                  {errors.nextReviewDate.message}
                </Text>
              )}
            </Stack>
            <Controller
              control={control}
              name="requireReacknowledgement"
              render={({ field }) => (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="require-reacknowledgement"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="require-reacknowledgement">
                      Ask employees to acknowledge it again
                    </Label>
                    <Text size="xs" variant="muted">
                      PCI DSS 12.6.3 expects a yearly acknowledgement. Earlier sign-offs stay in
                      the history.
                    </Text>
                  </div>
                </div>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Record review
              </Button>
            </DialogFooter>
          </Stack>
        </form>
      </DialogContent>
    </Dialog>
  );
}
