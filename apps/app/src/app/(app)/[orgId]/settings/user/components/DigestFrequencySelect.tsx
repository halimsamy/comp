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

/** How often the task digest is sent. */
export function DigestFrequencySelect({
  value,
  onChange,
  disabled,
}: {
  value: DigestFrequency;
  onChange: (value: DigestFrequency) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Text weight="medium">Digest frequency</Text>
        <Text size="sm" variant="muted">
          How often the task digest email is sent.
        </Text>
      </div>
      <div className="w-full sm:w-[200px]">
        <Select
          value={value}
          disabled={disabled}
          onValueChange={(next) => next && onChange(next === 'daily' ? 'daily' : 'weekly')}
        >
          <SelectTrigger aria-label="Digest frequency">
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
