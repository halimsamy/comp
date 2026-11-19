'use client';

import { Checkbox } from '@trycompai/design-system';
import { useId } from 'react';

interface PolicyAttestationProps {
  text: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Required statement the employee ticks before accepting (stored as evidence). */
export function PolicyAttestation({
  text,
  checked,
  onCheckedChange,
  disabled,
}: PolicyAttestationProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <label htmlFor={id} className="cursor-pointer text-sm leading-snug">
        {text}
      </label>
    </div>
  );
}
