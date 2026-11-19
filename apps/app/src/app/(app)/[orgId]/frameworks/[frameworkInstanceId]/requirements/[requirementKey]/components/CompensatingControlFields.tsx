'use client';

import { Checkbox, Input, Label, Text } from '@trycompai/design-system';
import { Controller, type UseFormReturn } from 'react-hook-form';
import type { ApplicabilityForm } from './applicability-schema';
import { ApplicabilityTextField } from './ApplicabilityTextField';

export interface ControlOption {
  id: string;
  name: string;
}

/** PCI DSS Appendix C Compensating Controls Worksheet. */
export function CompensatingControlFields({
  form,
  controlOptions,
}: {
  form: UseFormReturn<ApplicabilityForm>;
  controlOptions: ControlOption[];
}) {
  const { errors } = form.formState;
  return (
    <div className="flex flex-col gap-4 rounded-md border p-3">
      <Text size="sm" weight="medium">
        Compensating Controls Worksheet
      </Text>
      <ApplicabilityTextField form={form} name="constraints" label="Constraints" placeholder="Legitimate technical or business constraints that prevent meeting the requirement as stated" />
      <ApplicabilityTextField form={form} name="objective" label="Objective" placeholder="The objective of the original control, and how the compensating controls meet it" />
      <ApplicabilityTextField form={form} name="identifiedRisk" label="Identified risk" placeholder="Any additional risk posed by not using the original control" />
      <div className="grid gap-1.5">
        <Label>Compensating controls</Label>
        <Controller
          control={form.control}
          name="compensatingControlIds"
          render={({ field }) => (
            <div className="max-h-48 overflow-y-auto rounded-md border p-2">
              {controlOptions.length === 0 ? (
                <Text size="xs" variant="muted">
                  No controls in this framework yet.
                </Text>
              ) : (
                controlOptions.map((control) => (
                  <label key={control.id} className="flex cursor-pointer items-center gap-2 py-1">
                    <Checkbox
                      checked={field.value.includes(control.id)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...field.value, control.id]
                            : field.value.filter((id) => id !== control.id),
                        )
                      }
                    />
                    <span className="text-sm">{control.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
        />
        {errors.compensatingControlIds && (
          <Text size="xs" variant="destructive">
            {errors.compensatingControlIds.message}
          </Text>
        )}
      </div>
      <ApplicabilityTextField form={form} name="validation" label="Validation" placeholder="How the compensating controls were validated and tested" />
      <ApplicabilityTextField form={form} name="maintenance" label="Maintenance" placeholder="Process and controls in place to maintain the compensating controls" />
      <div className="grid gap-1.5">
        <Label htmlFor="applicability-revalidateAt">Re-validate by</Label>
        <Input id="applicability-revalidateAt" type="date" {...form.register('revalidateAt')} />
        {errors.revalidateAt && (
          <Text size="xs" variant="destructive">
            {errors.revalidateAt.message}
          </Text>
        )}
      </div>
    </div>
  );
}
