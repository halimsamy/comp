'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@trycompai/design-system';
import { Add, TrashCan } from '@trycompai/design-system/icons';
import { Controller, useFieldArray, type UseFormReturn } from 'react-hook-form';
import type { ApplicabilityForm } from './applicability-schema';
import { ApplicabilityTextField } from './ApplicabilityTextField';

type TraSubmission = {
  id: string;
  submittedAt: string;
  data: { requirementAddressed?: string };
};

/** PCI DSS Appendix D/E: customized approach objective, controls matrix and its targeted risk analysis. */
export function CustomizedApproachFields({ form }: { form: UseFormReturn<ApplicabilityForm> }) {
  const { errors } = form.formState;
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'matrix' });
  const { data, isLoading, error } = useApiSWR<{ submissions: TraSubmission[] }>(
    '/v1/evidence-forms/targeted-risk-analysis',
  );
  const submissions = Array.isArray(data?.data?.submissions) ? data.data.submissions : [];
  const items = submissions.map((s) => ({
    value: s.id,
    label: `${s.data.requirementAddressed ?? 'Analysis'} · ${new Date(s.submittedAt).toLocaleDateString()}`,
  }));

  return (
    <div className="flex flex-col gap-4 rounded-md border p-3">
      <Text size="sm" weight="medium">
        Customized approach
      </Text>
      <ApplicabilityTextField form={form} name="objective" label="Customized approach objective" placeholder="The objective from the requirement's Customized Approach Objective" />
      <div className="grid gap-2">
        <Label>Controls matrix</Label>
        {fields.map((row, index) => (
          <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Input placeholder="Control" aria-label={`Control ${index + 1}`} {...form.register(`matrix.${index}.control`)} />
            <Input placeholder="How it meets the objective" aria-label={`How control ${index + 1} meets the objective`} {...form.register(`matrix.${index}.howMeetsObjective`)} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => remove(index)} disabled={fields.length === 1}>
              <TrashCan size={16} />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" iconLeft={<Add size={16} />} onClick={() => append({ control: '', howMeetsObjective: '' })}>
            Add control
          </Button>
        </div>
        {errors.matrix?.message && (
          <Text size="xs" variant="destructive">
            {errors.matrix.message}
          </Text>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label>Targeted risk analysis (12.3.2)</Label>
        <Controller
          control={form.control}
          name="targetedRiskAnalysisSubmissionId"
          render={({ field }) => (
            <Select items={items} value={field.value || null} onValueChange={(v) => field.onChange(typeof v === 'string' ? v : '')}>
              <SelectTrigger disabled={isLoading}>
                <SelectValue placeholder={isLoading ? 'Loading…' : 'Pick a submitted analysis'} />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {!isLoading && (error || submissions.length === 0) && (
          <Text size="xs" variant="muted">
            {error ? 'Could not load analyses.' : 'Submit a targeted risk analysis in Documents first.'}
          </Text>
        )}
        {errors.targetedRiskAnalysisSubmissionId && (
          <Text size="xs" variant="destructive">
            {errors.targetedRiskAnalysisSubmissionId.message}
          </Text>
        )}
      </div>
    </div>
  );
}
