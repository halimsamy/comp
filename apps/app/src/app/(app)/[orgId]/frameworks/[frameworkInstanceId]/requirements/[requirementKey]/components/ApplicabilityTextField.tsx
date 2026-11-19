'use client';

import { Label, Text, Textarea } from '@trycompai/design-system';
import type { UseFormReturn } from 'react-hook-form';
import type { ApplicabilityForm } from './applicability-schema';

type TextKey = 'justification' | 'constraints' | 'objective' | 'identifiedRisk' | 'validation' | 'maintenance';

export function ApplicabilityTextField({
  form,
  name,
  label,
  placeholder,
  rows = 3,
}: {
  form: UseFormReturn<ApplicabilityForm>;
  name: TextKey;
  label: string;
  placeholder?: string;
  rows?: number;
}) {
  const error = form.formState.errors[name]?.message;
  const id = `applicability-${name}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={rows} placeholder={placeholder} {...form.register(name)} />
      {error && (
        <Text size="xs" variant="destructive">
          {error}
        </Text>
      )}
    </div>
  );
}
