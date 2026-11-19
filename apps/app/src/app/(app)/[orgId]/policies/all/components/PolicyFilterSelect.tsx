'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';
import { POLICY_STAGE_LABELS } from '../../lib/policy-stage';

export interface FilterOption {
  value: string;
  label: string;
}

export const STAGE_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All statuses' },
  ...Object.entries(POLICY_STAGE_LABELS).map(([value, label]) => ({ value, label })),
  { value: 'archived', label: 'Archived' },
];

export function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}) {
  const label = options.find((option) => option.value === value)?.label ?? options[0]?.label;
  return (
    <div className="min-w-0 lg:w-[170px]">
      <Select value={value} onValueChange={(next) => onChange(next ?? 'all')}>
        <SelectTrigger>
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
