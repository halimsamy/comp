'use client';

import {
  FieldError,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
} from '@trycompai/design-system';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

const NONE = 'none';

/** RHF-controlled select; an empty string value maps to the "none" option. */
export function FormSelect<T extends FieldValues>({
  control,
  name,
  label,
  options,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Stack gap="1">
      <Text size="xs" variant="muted" weight="medium">
        {label}
      </Text>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <>
            <Select
              value={field.value || NONE}
              onValueChange={(next) => field.onChange(next === NONE ? '' : next)}
            >
              <SelectTrigger aria-label={label}>
                <SelectValue>
                  {options.find((option) => option.value === (field.value || NONE))?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{fieldState.error?.message}</FieldError>
          </>
        )}
      />
    </Stack>
  );
}

export const NONE_OPTION = NONE;
