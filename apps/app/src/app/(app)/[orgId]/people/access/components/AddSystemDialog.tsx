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
  Textarea,
} from '@trycompai/design-system';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

const systemSchema = z.object({
  name: z.string().trim().min(1, 'Name the system').max(120),
  description: z.string().max(500),
});
export type SystemValues = z.infer<typeof systemSchema>;

/** Add a system without an integration (e.g. a bank portal); its accounts come from a CSV. */
export function AddSystemDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: SystemValues) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SystemValues>({
    resolver: zodResolver(systemSchema),
    defaultValues: { name: '', description: '' },
  });

  const handleSave = handleSubmit(async (values) => {
    await onSave(values);
    reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add a system</DialogTitle>
          <DialogDescription>
            For systems without an integration, such as a bank portal or payment gateway console.
            You will import its account list from a CSV export.
          </DialogDescription>
        </DialogHeader>
        <form id="add-system-form" onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="system-name">Name</Label>
            <Controller
              control={control}
              name="name"
              render={({ field: { ref: _ref, ...field } }) => (
                <Input {...field} id="system-name" placeholder="Acquirer merchant portal" />
              )}
            />
            {errors.name && (
              <span role="alert" className="text-xs text-destructive">
                {errors.name.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="system-description">Description (optional)</Label>
            <Controller
              control={control}
              name="description"
              render={({ field: { ref: _ref, ...field } }) => (
                <Textarea {...field} id="system-description" rows={2} placeholder="Refunds and settlement reports" />
              )}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-system-form" loading={isSubmitting}>
            Add system
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
