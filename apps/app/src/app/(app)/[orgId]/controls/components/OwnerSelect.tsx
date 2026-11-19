'use client';

import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@trycompai/design-system';

export const UNASSIGNED_OWNER = 'unassigned';

/** Active members as owner options, plus "Unassigned". */
export function OwnerSelect({
  value,
  onChange,
  disabled,
  label = 'Owner',
  placeholder,
  departed,
}: {
  /** Member id, UNASSIGNED_OWNER, or null for nothing picked yet (shows the placeholder). */
  value: string | null;
  onChange: (ownerId: string | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  /** A current owner who left: kept as an option so the select shows who needs replacing. */
  departed?: { id: string; name: string } | null;
}) {
  const { members, isLoading } = useOrganizationMembers();
  const items = [
    { value: UNASSIGNED_OWNER, label: 'Unassigned' },
    ...(departed ? [{ value: departed.id, label: `${departed.name} (left)` }] : []),
    ...(members ?? [])
      .filter((m) => !m.deactivated)
      .map((m) => ({ value: m.id, label: m.user.name || m.user.email })),
  ];
  const handleChange = (next: unknown) =>
    onChange(typeof next === 'string' && next !== UNASSIGNED_OWNER ? next : null);

  return (
    <Select items={items} value={value} onValueChange={handleChange}>
      <SelectTrigger aria-label={label} disabled={disabled || isLoading}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
