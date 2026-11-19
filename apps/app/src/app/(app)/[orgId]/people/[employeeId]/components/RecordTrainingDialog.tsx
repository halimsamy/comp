'use client';

import type { MemberTrainingModule } from '@/hooks/use-member-training';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const today = () => new Date().toISOString().slice(0, 10);

const schema = z.object({
  module: z.string().min(1, 'Pick the training'),
  completedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date')
    .refine((value) => value <= today(), 'The date cannot be in the future'),
});
type FormValues = z.infer<typeof schema>;

/** #94: record training taken outside the portal, with an optional certificate or sign-in sheet. */
export function RecordTrainingDialog({
  open,
  onOpenChange,
  modules,
  onRecord,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modules: MemberTrainingModule[];
  onRecord: (input: { module: string; completedAt: string; file?: File }) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const options = [
    { value: 'general', label: 'Security awareness training' },
    { value: 'hipaa', label: 'HIPAA training' },
    ...modules.map((m) => ({ value: m.id, label: m.title })),
  ];
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { module: 'general', completedAt: today() } });

  const handleClose = (next: boolean) => {
    if (!next) {
      reset({ module: 'general', completedAt: today() });
      setFile(null);
    }
    onOpenChange(next);
  };

  const handleConfirm = handleSubmit(async (values) => {
    try {
      await onRecord({ ...values, file: file ?? undefined });
      toast.success('Training recorded');
      handleClose(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to record the training');
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Record training</DialogTitle>
          <DialogDescription>
            For training taken outside the portal, such as a classroom session or another platform. It counts as a
            completed cycle from the date you enter.
          </DialogDescription>
        </DialogHeader>
        <form id="record-training-form" onSubmit={handleConfirm} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="record-training-module">Training</Label>
            <Controller
              control={control}
              name="module"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(value) => field.onChange(value ?? '')}>
                  <SelectTrigger id="record-training-module" aria-label="Training">
                    <SelectValue>{(value: string) => options.find((o) => o.value === value)?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="record-training-date">Completed on</Label>
            <Controller
              control={control}
              name="completedAt"
              render={({ field: { ref: _ref, ...field } }) => (
                <Input {...field} id="record-training-date" type="date" max={today()} />
              )}
            />
            {errors.completedAt && (
              <span role="alert" className="text-xs text-destructive">
                {errors.completedAt.message}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="record-training-file">Certificate or sign-in sheet (optional)</Label>
            <input
              id="record-training-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button type="submit" form="record-training-form" loading={isSubmitting}>
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
