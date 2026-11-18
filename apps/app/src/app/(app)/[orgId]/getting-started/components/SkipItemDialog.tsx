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
  Label,
  Textarea,
} from '@trycompai/design-system';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

const skipSchema = z.object({
  reason: z.string().trim().min(1, 'Tell your auditor why this step does not apply').max(500),
});
type SkipValues = z.infer<typeof skipSchema>;

/** Asks for a reason before skipping a step, so the decision is explainable later. */
export function SkipItemDialog({
  itemTitle,
  open,
  onOpenChange,
  onSkip,
}: {
  itemTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkip: (reason: string) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<SkipValues>({ resolver: zodResolver(skipSchema), defaultValues: { reason: '' } });

  const handleClose = (next: boolean) => {
    if (!next) reset({ reason: '' });
    onOpenChange(next);
  };

  const handleSkip = handleSubmit(async ({ reason }) => {
    await onSkip(reason);
    handleClose(false);
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skip “{itemTitle}”</DialogTitle>
          <DialogDescription>
            Skipped steps count as complete. You can restore them at any time.
          </DialogDescription>
        </DialogHeader>
        <form id="skip-checklist-item" onSubmit={handleSkip} className="flex flex-col gap-2">
          <Label htmlFor="skip-reason">Reason</Label>
          <Controller
            control={control}
            name="reason"
            render={({ field: { ref: _ref, ...field } }) => (
              <Textarea
                {...field}
                id="skip-reason"
                rows={3}
                placeholder="e.g. We do not use a cloud provider"
              />
            )}
          />
          {errors.reason && (
            <span role="alert" className="text-xs text-destructive">
              {errors.reason.message}
            </span>
          )}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="skip-checklist-item" loading={isSubmitting}>
            Skip step
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
