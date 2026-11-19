'use client';

import { Button, Calendar, Label, Popover, PopoverContent, PopoverTrigger, Stack } from '@trycompai/design-system';
import { Calendar as CalendarIcon } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useState } from 'react';

/** Onboard/offboard date picker with a Clear action (#84). */
export function KeyDateField({
  id,
  label,
  value,
  onChange,
  canEdit,
}: {
  id: string;
  label: string;
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const handleSelect = (date: Date | undefined) => {
    onChange(date);
    setOpen(false);
  };

  return (
    <Stack gap="sm">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={canEdit && open} onOpenChange={(next) => canEdit && setOpen(next)}>
        <PopoverTrigger
          id={id}
          disabled={!canEdit}
          className="border-border bg-background text-foreground hover:bg-muted flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {value ? format(value, 'PPP') : 'Not set'}
          <CalendarIcon size={16} />
        </PopoverTrigger>
        <PopoverContent align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => handleSelect(date ?? undefined)}
            captionLayout="dropdown"
            fromYear={2000}
            toYear={new Date().getFullYear() + 1}
          />
          {value && (
            <div className="border-t p-2">
              <Button size="sm" variant="ghost" onClick={() => handleSelect(undefined)}>
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </Stack>
  );
}
