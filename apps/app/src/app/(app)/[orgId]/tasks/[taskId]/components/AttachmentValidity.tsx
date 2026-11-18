'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  Input,
  Label,
} from '@trycompai/design-system';
import { format } from 'date-fns';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
const validitySchema = z
  .object({ validFrom: day, validUntil: z.union([day, z.literal('')]) })
  .refine((v) => !v.validUntil || v.validFrom < v.validUntil, {
    message: 'The end must be after the start',
    path: ['validUntil'],
  });
type ValidityValues = z.infer<typeof validitySchema>;

export interface AttachmentValidityInfo {
  id: string;
  createdAt: string;
  validFrom?: string | null;
  validUntil?: string | null;
}

/** "Needs update" once a file's validity ends (task evidence is valid for one task cycle). */
export function isValidityExpired(attachment: AttachmentValidityInfo, now = new Date()): boolean {
  return !!attachment.validUntil && new Date(attachment.validUntil) < now;
}

/** Validity badge on an evidence file; people who can edit evidence can change the dates. */
export function AttachmentValidity({
  attachment,
  onChanged,
}: {
  attachment: AttachmentValidityInfo;
  onChanged: () => void;
}) {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('evidence', 'update');
  const [open, setOpen] = useState(false);
  const form = useForm<ValidityValues>({
    resolver: zodResolver(validitySchema),
    defaultValues: {
      validFrom: (attachment.validFrom ?? attachment.createdAt).slice(0, 10),
      validUntil: attachment.validUntil?.slice(0, 10) ?? '',
    },
  });

  const expired = isValidityExpired(attachment);
  const label = expired
    ? 'Needs update'
    : attachment.validUntil
      ? `Valid until ${format(new Date(attachment.validUntil), 'MMM d, yyyy')}`
      : null;

  const handleSave = form.handleSubmit(async (values) => {
    const res = await apiClient.patch(`/v1/attachments/${attachment.id}/validity`, {
      validFrom: values.validFrom,
      validUntil: values.validUntil || null,
    });
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Validity updated');
    setOpen(false);
    onChanged();
  });

  if (!label && !canEdit) return null;
  const badge = (
    <Badge variant={expired ? 'destructive' : 'secondary'}>{label ?? 'Set validity'}</Badge>
  );

  return (
    <>
      {canEdit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Change evidence validity"
          className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {badge}
        </button>
      ) : (
        badge
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={(event) => void handleSave(event)}>
            <DialogHeader>
              <DialogTitle>Evidence validity</DialogTitle>
              <DialogDescription>
                The file counts as evidence between these dates. After the end it shows as needing
                an update, and audit exports only include files valid in the audit period.
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`valid-from-${attachment.id}`}>Valid from</Label>
                <Input id={`valid-from-${attachment.id}`} type="date" {...form.register('validFrom')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`valid-until-${attachment.id}`}>Valid until (optional)</Label>
                <Input id={`valid-until-${attachment.id}`} type="date" {...form.register('validUntil')} />
                <FieldError>{form.formState.errors.validUntil?.message}</FieldError>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
