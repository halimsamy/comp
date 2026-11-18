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
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

export interface NoteRequest {
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  required: boolean;
  placeholder?: string;
  onConfirm: (note: string) => Promise<void>;
}

/** A confirm dialog with a note: decision reasons, remediation notes and sign-off. */
export function NoteDialog({
  request,
  onOpenChange,
}: {
  request: NoteRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const schema = useMemo(
    () =>
      z.object({
        note: request?.required
          ? z.string().trim().min(1, 'Add a note').max(1000)
          : z.string().max(1000),
      }),
    [request?.required],
  );
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ note: string }>({ resolver: zodResolver(schema), defaultValues: { note: '' } });

  const handleClose = (open: boolean) => {
    if (!open) reset({ note: '' });
    onOpenChange(open);
  };

  const handleConfirm = handleSubmit(async ({ note }) => {
    if (!request) return;
    await request.onConfirm(note.trim());
    handleClose(false);
  });

  return (
    <Dialog open={request !== null} onOpenChange={handleClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <form id="access-note-form" onSubmit={handleConfirm} className="flex flex-col gap-2">
          <Label htmlFor="access-note">{request?.label}</Label>
          <Controller
            control={control}
            name="note"
            render={({ field: { ref: _ref, ...field } }) => (
              <Textarea {...field} id="access-note" rows={3} placeholder={request?.placeholder} />
            )}
          />
          {errors.note && (
            <span role="alert" className="text-xs text-destructive">
              {errors.note.message}
            </span>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button type="submit" form="access-note-form" loading={isSubmitting}>
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
