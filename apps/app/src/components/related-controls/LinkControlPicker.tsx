'use client';

import { useControlsOverview } from '@/hooks/use-controls-overview';
import {
  buttonVariants,
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { requirementChips } from './RequirementCodes';

/** "+ Link control" picker: search controls, preview the ISO / PCI codes each one carries. */
export function LinkControlPicker({
  linkedIds,
  disabled,
  onSelect,
}: {
  linkedIds: Set<string>;
  disabled?: boolean;
  onSelect: (controlId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Only load the org's controls once the picker opens.
  const { controls, isLoading } = useControlsOverview({ enabled: open });
  const available = controls.filter((c) => !linkedIds.has(c.id));

  const handleSelect = (controlId: string) => {
    setOpen(false);
    onSelect(controlId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        <Add size={14} />
        Link control
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8}>
        <Command>
          <CommandInput placeholder="Search controls or codes (e.g. A.5.15, 7.2.1)..." />
          <div className="h-2" />
          <CommandList>
            <CommandEmpty>{isLoading ? 'Loading controls...' : 'No controls found.'}</CommandEmpty>
            {available.map((control) => {
              const codes = requirementChips(control.frameworks).map((chip) => chip.label);
              return (
                <CommandItem
                  key={control.id}
                  value={`${control.name} ${codes.join(' ')}`}
                  onSelect={() => handleSelect(control.id)}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{control.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {codes.length > 0 ? codes.join(', ') : 'Not mapped to a framework'}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
