'use client';

import { useApi } from '@/hooks/use-api';
import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  TARGET_DEPARTMENTS,
  TARGET_ROLES,
  toTrainingModulePayload,
  trainingModuleSchema,
  type TrainingModuleForm,
} from './trainingModuleSchema';

const DEFAULTS: TrainingModuleForm = {
  title: '',
  description: '',
  contentUrl: '',
  frameworkReference: '',
  targetRoles: [],
  targetDepartments: [],
  recurrenceMonths: 12,
};

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T[];
  onChange: (next: T[]) => void;
  label: string;
}) {
  const handleToggle = (option: T) =>
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => {
        const selected = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => handleToggle(option)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              selected
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {option.length <= 4 ? option.toUpperCase() : option}
          </button>
        );
      })}
    </div>
  );
}

export function TrainingModuleDialog({ onCreated }: { onCreated: () => void }) {
  const { post } = useApi();
  const form = useForm<TrainingModuleForm>({
    resolver: zodResolver(trainingModuleSchema),
    defaultValues: DEFAULTS,
  });
  const { errors, isSubmitting } = form.formState;
  const { members } = useOrganizationMembers();
  // Member.department is free text, so offer the custom departments people already have.
  const departments = useMemo(() => {
    const used = (members ?? []).map((m) => m.department).filter((d) => d && d !== 'none');
    return Array.from(new Set([...TARGET_DEPARTMENTS, ...used]));
  }, [members]);

  const handleSubmit = form.handleSubmit(async (values) => {
    const res = await post('/v1/training/modules', toTrainingModulePayload(values));
    if (res.error) {
      toast.error('Failed to create training module');
      return;
    }
    toast.success('Training module created');
    form.reset(DEFAULTS);
    onCreated();
  });

  return (
    <DialogContent>
      <form onSubmit={handleSubmit} className="contents">
        <DialogHeader>
          <DialogTitle>Add training module</DialogTitle>
        </DialogHeader>
        <Stack gap="md">
          <div className="grid gap-1.5">
            <Label htmlFor="module-title">Title</Label>
            <Input
              id="module-title"
              placeholder="e.g., Secure coding for developers"
              {...form.register('title')}
            />
            {errors.title && (
              <Text size="xs" variant="destructive">
                {errors.title.message}
              </Text>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="module-description">Description</Label>
            <Textarea
              id="module-description"
              rows={3}
              placeholder="What the training covers"
              {...form.register('description')}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="module-url">Training link</Label>
            <Input id="module-url" placeholder="https://..." {...form.register('contentUrl')} />
            {errors.contentUrl && (
              <Text size="xs" variant="destructive">
                {errors.contentUrl.message}
              </Text>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="module-framework">Requirement</Label>
              <Input
                id="module-framework"
                placeholder="e.g., PCI DSS 6.2.2"
                {...form.register('frameworkReference')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="module-recurrence">Renew every (months)</Label>
              <Input
                id="module-recurrence"
                type="number"
                min={1}
                max={60}
                {...form.register('recurrenceMonths', { valueAsNumber: true })}
              />
              {errors.recurrenceMonths && (
                <Text size="xs" variant="destructive">
                  {errors.recurrenceMonths.message}
                </Text>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Roles (none selected = everyone)</Label>
            <Controller
              control={form.control}
              name="targetRoles"
              render={({ field }) => (
                <ChipGroup
                  label="Roles"
                  options={TARGET_ROLES}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Departments (none selected = every department)</Label>
            <Controller
              control={form.control}
              name="targetDepartments"
              render={({ field }) => (
                <ChipGroup
                  label="Departments"
                  options={departments}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        </Stack>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" loading={isSubmitting}>
            Create
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
