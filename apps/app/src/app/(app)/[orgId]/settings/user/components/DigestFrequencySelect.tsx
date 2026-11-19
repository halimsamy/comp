'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@trycompai/design-system';
import type { DigestFrequency } from '../hooks/useEmailPreferences';

const OPTIONS: { value: DigestFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly (Mondays)' },
  { value: 'daily', label: 'Daily' },
];

/** How often a digest email is sent. */
export function DigestFrequencySelect({
  value,
  onChange,
  disabled,
  label = 'Digest frequency',
  description = 'How often the task digest email is sent.',
}: {
  value: DigestFrequency;
  onChange: (value: DigestFrequency) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Text weight="medium">{label}</Text>
        <Text size="sm" variant="muted">
          {description}
        </Text>
      </div>
      <div className="w-full sm:w-[200px]">
        <Select
          value={value}
          disabled={disabled}
          onValueChange={(next) => next && onChange(next === 'daily' ? 'daily' : 'weekly')}
        >
          <SelectTrigger aria-label={label}>
            <SelectValue>{OPTIONS.find((o) => o.value === value)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
