'use client';

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
  FieldError,
  Input,
  Label,
} from '@trycompai/design-system';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');
const schema = z
  .object({ validFrom: z.union([day, z.literal('')]), validUntil: z.union([day, z.literal('')]) })
  .refine((v) => !v.validFrom || !v.validUntil || v.validFrom < v.validUntil, {
    message: 'The end must be after the start',
    path: ['validUntil'],
  });
type Values = z.infer<typeof schema>;

/** "Set validity for all files on this task" (#107). */
export function TaskFilesValidity({
  taskId,
  fileCount,
  onChanged,
}: {
  taskId: string;
  fileCount: number;
  onChanged: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { validFrom: '', validUntil: '' } });

  if (!hasPermission('evidence', 'update') || fileCount === 0) return null;

  const handleSave = form.handleSubmit(async (values) => {
    const res = await apiClient.patch<{ updatedCount: number; skippedCount: number }>(
      `/v1/tasks/${taskId}/attachments/validity`,
      { ...(values.validFrom && { validFrom: values.validFrom }), validUntil: values.validUntil || null },
    );
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Failed to update validity');
      return;
    }
    const { updatedCount, skippedCount } = res.data;
    toast.success(
      `Validity set on ${updatedCount} file${updatedCount === 1 ? '' : 's'}` +
        (skippedCount > 0 ? `; ${skippedCount} starting after the end date were left unchanged` : ''),
    );
    setOpen(false);
    form.reset();
    onChanged();
  });

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Set validity for all files
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={(event) => void handleSave(event)}>
            <DialogHeader>
              <DialogTitle>Validity for all files</DialogTitle>
              <DialogDescription>
                {`Applies to the ${fileCount} file${fileCount === 1 ? '' : 's'} on this task. Leave the start empty to keep each file's own start (its upload date). Audit exports only include files valid in the audit period.`}
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`task-valid-from-${taskId}`}>Valid from (optional)</Label>
                <Input id={`task-valid-from-${taskId}`} type="date" {...form.register('validFrom')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`task-valid-until-${taskId}`}>Valid until (optional)</Label>
                <Input id={`task-valid-until-${taskId}`} type="date" {...form.register('validUntil')} />
                <FieldError>{form.formState.errors.validUntil?.message}</FieldError>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Apply to all files
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
