'use client';

import type { AuditRequirement } from '@/hooks/use-audits';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  FieldError,
  Grid,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const NONE = 'none';

export const requestSchema = z.object({
  title: z.string().trim().min(1, 'Say what you need').max(200),
  description: z.string().trim().max(4000),
  requirementId: z.string(),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]),
});

type RequestValues = z.infer<typeof requestSchema>;

/** An auditor's evidence request, optionally tied to one requirement. */
export function NewAuditRequestForm({
  requirements,
  onSubmit,
  onCancel,
}: {
  requirements: AuditRequirement[];
  onSubmit: (payload: {
    title: string;
    description?: string;
    requirementId?: string;
    dueDate?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { title: '', description: '', requirementId: NONE, dueDate: '' },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit({
        title: values.title,
        ...(values.description ? { description: values.description } : {}),
        ...(values.requirementId !== NONE ? { requirementId: values.requirementId } : {}),
        ...(values.dueDate ? { dueDate: values.dueDate } : {}),
      });
      toast.success('Request sent to the team');
      form.reset();
      onCancel();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send the request');
    }
  });

  const options = [
    { value: NONE, label: 'Whole audit' },
    ...requirements.map((r) => ({ value: r.id, label: `${r.identifier} ${r.name}`.trim() })),
  ];

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-lg border border-border p-4"
    >
      <Stack gap="3">
        <Text size="sm" weight="semibold">
          New evidence request
        </Text>
        <Controller
          control={form.control}
          name="title"
          render={({ field: { ref: _ref, ...field }, fieldState }) => (
            <>
              <Input {...field} aria-label="Request" placeholder="e.g. List of new hires in the audit period" />
              <FieldError>{fieldState.error?.message}</FieldError>
            </>
          )}
        />
        <Controller
          control={form.control}
          name="description"
          render={({ field: { ref: _ref, ...field } }) => (
            <Textarea {...field} aria-label="Details" placeholder="Details (optional)" maxLength={4000} />
          )}
        />
        <Grid cols={{ base: '1', sm: '2' }} gap="3">
          <Controller
            control={form.control}
            name="requirementId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={(next) => field.onChange(next ?? NONE)}>
                <SelectTrigger aria-label="Requirement">
                  <SelectValue>{options.find((o) => o.value === field.value)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <Controller
            control={form.control}
            name="dueDate"
            render={({ field: { ref: _ref, ...field } }) => (
              <Input {...field} type="date" aria-label="Due date" />
            )}
          />
        </Grid>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Send request
          </Button>
        </div>
      </Stack>
    </form>
  );
}
