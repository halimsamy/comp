'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

/** A labelled single-choice filter that stacks full-width on mobile. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="w-full sm:w-[170px]">
      <Select value={value} onValueChange={(next) => next && onChange(next as T)}>
        <SelectTrigger aria-label={label}>
          <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
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

/** "All <noun>" followed by every entry of a label map. */
export function optionsFrom<T extends string>({
  allLabel,
  labels,
}: {
  allLabel: string;
  labels: Record<T, string>;
}): FilterOption<T | 'all'>[] {
  return [
    { value: 'all', label: allLabel },
    ...(Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label })),
  ];
}
