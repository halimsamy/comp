'use client';

import type { AccessReviewItem } from '@/hooks/use-access-reviews';
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
  Textarea,
} from '@trycompai/design-system';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

const schema = z.object({
  url: z.union([z.literal(''), z.string().trim().url('Enter a full link, e.g. https://jira.example.com/browse/IT-12')]),
  note: z.string().max(1000),
});
type FormValues = z.infer<typeof schema>;

export interface RemediateInput {
  note?: string;
  url?: string;
  file?: File;
}

/** #90: mark a revoke/modify done with a ticket link and/or a screenshot as proof. */
export function RemediateDialog({
  item,
  onOpenChange,
  onConfirm,
}: {
  item: AccessReviewItem | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: RemediateInput) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { url: '', note: '' } });

  const handleClose = (open: boolean) => {
    if (!open) {
      reset({ url: '', note: '' });
      setFile(null);
    }
    onOpenChange(open);
  };

  const handleConfirm = handleSubmit(async ({ url, note }) => {
    await onConfirm({ url: url || undefined, note: note.trim() || undefined, file: file ?? undefined });
    handleClose(false);
  });

  return (
    <Dialog open={item !== null} onOpenChange={handleClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Mark the change as done</DialogTitle>
          <DialogDescription>
            Confirm that the {item?.decision} of {item?.accountName} was applied. Add the ticket or a screenshot as
            proof. If the account still shows as active at the next sync, it is flagged.
          </DialogDescription>
        </DialogHeader>
        <form id="access-remediate-form" onSubmit={handleConfirm} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remediate-url">Ticket link</Label>
            <Controller
              control={control}
              name="url"
              render={({ field: { ref: _ref, ...field } }) => (
                <Input {...field} id="remediate-url" placeholder="https://jira.example.com/browse/IT-12" />
              )}
            />
            {errors.url && (
              <span role="alert" className="text-xs text-destructive">
                {errors.url.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remediate-file">Screenshot or export</Label>
            <input
              id="remediate-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,.txt"
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remediate-note">Note (optional)</Label>
            <Controller
              control={control}
              name="note"
              render={({ field: { ref: _ref, ...field } }) => (
                <Textarea {...field} id="remediate-note" rows={2} placeholder="What was changed" />
              )}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button type="submit" form="access-remediate-form" loading={isSubmitting}>
            Mark done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
