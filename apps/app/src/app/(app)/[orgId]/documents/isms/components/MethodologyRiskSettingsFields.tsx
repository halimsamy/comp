'use client';

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@trycompai/design-system';
import { type Control, Controller } from 'react-hook-form';
import { METHODOLOGY_LEVEL_LABELS } from './risk-methodology-constants';
import type { RiskMethodologyValues } from './RiskMethodologyForm';

export const METHODOLOGY_LEVELS = ['very-low', 'low', 'medium', 'high', 'very-high'] as const;
export type MethodologyLevel = (typeof METHODOLOGY_LEVELS)[number];

const levelLabel = (level: string) =>
  METHODOLOGY_LEVEL_LABELS[METHODOLOGY_LEVELS.findIndex((candidate) => candidate === level)] ?? level;

export const REVIEW_INTERVALS = [
  { months: 1, label: 'Monthly' },
  { months: 3, label: 'Quarterly' },
  { months: 6, label: 'Every 6 months' },
  { months: 12, label: 'Annually' },
] as const;

const intervalLabel = (months: number) =>
  REVIEW_INTERVALS.find((option) => option.months === months)?.label ?? `Every ${months} months`;

/**
 * The two structured methodology settings the Risks module reads: the
 * acceptance threshold (6.1.3 f) and the periodic review interval (8.2).
 */
export function MethodologyRiskSettingsFields({
  control,
  canEdit,
  values,
}: {
  control: Control<RiskMethodologyValues>;
  canEdit: boolean;
  values: { acceptanceRequiredFromLevel: string; reviewIntervalMonths: number };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-col gap-1">
        <Text weight="semibold">Settings used by the Risks module</Text>
        <Text size="sm" variant="muted">
          Risks at or above the threshold ask their owner for a formal acceptance, and the
          register review is scheduled at this interval.
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="methodology-acceptance-level">Owner acceptance required from</Label>
          {canEdit ? (
            <Controller
              control={control}
              name="acceptanceRequiredFromLevel"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                  <SelectTrigger id="methodology-acceptance-level" aria-label="Owner acceptance required from">
                    <SelectValue>{(value: string) => `${levelLabel(value)} residual risk`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {METHODOLOGY_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {levelLabel(level)} residual risk
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          ) : (
            <p className="text-sm">{levelLabel(values.acceptanceRequiredFromLevel)} residual risk</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="methodology-review-interval">Register review</Label>
          {canEdit ? (
            <Controller
              control={control}
              name="reviewIntervalMonths"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(value) => value && field.onChange(Number(value))}
                >
                  <SelectTrigger id="methodology-review-interval" aria-label="Register review">
                    <SelectValue>{(value: string) => intervalLabel(Number(value))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_INTERVALS.map((option) => (
                      <SelectItem key={option.months} value={String(option.months)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          ) : (
            <p className="text-sm">{intervalLabel(values.reviewIntervalMonths)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
