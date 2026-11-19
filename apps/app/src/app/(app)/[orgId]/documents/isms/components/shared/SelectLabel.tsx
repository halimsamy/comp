import { SelectValue } from '@trycompai/design-system';

/** Turns `{ id, name }` options into the labels map SelectLabel takes. */
export const optionLabels = (options: ReadonlyArray<{ id: string; name: string }>) =>
  Object.fromEntries(options.map((option) => [option.id, option.name]));

/**
 * A Select trigger that shows the chosen option's label, not its raw value
 * (a member id or a snake_case status) (#38). Values without a label, like an
 * "Unassigned" sentinel, show the placeholder.
 */
export function SelectLabel({
  labels,
  placeholder,
}: {
  labels: Readonly<Record<string, string>>;
  placeholder?: string;
}) {
  return (
    <SelectValue placeholder={placeholder}>
      {(value: unknown) =>
        (typeof value === 'string' && labels[value]) || placeholder || String(value ?? '')
      }
    </SelectValue>
  );
}
