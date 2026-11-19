'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@trycompai/design-system';

export type FilterOption = { value: string; label: string };

/** Compact labelled select for table filters; an empty value falls back to "all". */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="w-full sm:w-44">
      <Select items={options} value={value} onValueChange={(v) => onChange(String(v ?? 'all'))}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
