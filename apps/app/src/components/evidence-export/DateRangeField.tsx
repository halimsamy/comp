'use client';

import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from '@trycompai/design-system';
import { Calendar as CalendarIcon } from '@trycompai/design-system/icons';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

const toDay = (date: Date | undefined) => (date ? format(date, 'yyyy-MM-dd') : '');
const toDate = (value: string) => (value ? parseISO(value) : undefined);

/** "Jan 1, 2026 – Dec 31, 2026", or "All time" when no bound is set. */
export function rangeLabel({ from, to }: { from: string; to: string }): string {
  const label = (value: string) => format(parseISO(value), 'MMM d, yyyy');
  if (from && to) return `${label(from)} – ${label(to)}`;
  if (from) return `From ${label(from)}`;
  if (to) return `Until ${label(to)}`;
  return 'All time';
}

/** Design-system date-range picker over `YYYY-MM-DD` strings; empty means all time. */
export function DateRangeField({
  id,
  from,
  to,
  onChange,
}: {
  id: string;
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const handleSelect = (range: DateRange | undefined) =>
    onChange({ from: toDay(range?.from), to: toDay(range?.to) });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        className="border-border bg-background text-foreground hover:bg-muted flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm"
      >
        <span className={from || to ? '' : 'text-muted-foreground'}>{rangeLabel({ from, to })}</span>
        <CalendarIcon size={16} />
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          mode="range"
          selected={{ from: toDate(from), to: toDate(to) }}
          onSelect={handleSelect}
          defaultMonth={toDate(from)}
          captionLayout="dropdown"
          fromYear={2015}
          toYear={new Date().getFullYear() + 1}
        />
        {(from || to) && (
          <div className="border-t p-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => onChange({ from: '', to: '' })}>
              All time
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
