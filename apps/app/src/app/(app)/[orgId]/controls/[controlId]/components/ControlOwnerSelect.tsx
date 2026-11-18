'use client';

import { controlsOverviewKey } from '@/hooks/use-controls-overview';
import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@trycompai/design-system';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';

const UNASSIGNED = 'unassigned';

export interface ControlOwnerSummary {
  id: string;
  deactivated: boolean;
  user: { name: string | null; email: string };
}

function ownerLabel(owner: ControlOwnerSummary | null): string {
  if (!owner) return 'Unassigned';
  const name = owner.user.name || owner.user.email;
  return owner.deactivated ? `${name} (left, needs reassignment)` : name;
}

interface OwnerProps {
  controlId: string;
  owner: ControlOwnerSummary | null;
}

/** Accountable owner of a control; editable with control:update. */
export function ControlOwnerSelect(props: OwnerProps) {
  const { hasPermission } = usePermissions();
  if (hasPermission('control', 'update')) return <OwnerPicker {...props} />;
  return (
    <Text size="sm" variant="muted">
      Owner: {ownerLabel(props.owner)}
    </Text>
  );
}

function OwnerPicker({ controlId, owner }: OwnerProps) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  // Only editors load the member list.
  const { members } = useOrganizationMembers();
  const [saving, setSaving] = useState(false);

  const active = (members ?? []).filter((m) => !m.deactivated);
  const items = [
    { value: UNASSIGNED, label: 'Unassigned' },
    // Keep a departed owner visible so the select can show who needs replacing.
    ...(owner?.deactivated ? [{ value: owner.id, label: ownerLabel(owner) }] : []),
    ...active.map((m) => ({ value: m.id, label: m.user.name || m.user.email })),
  ];

  const handleChange = async (value: unknown) => {
    const ownerId = value === UNASSIGNED ? null : String(value);
    setSaving(true);
    try {
      const res = await apiClient.patch(`/v1/controls/${controlId}/owner`, { ownerId });
      if (res.error) throw new Error(res.error);
      await mutate(controlsOverviewKey);
      router.refresh();
      toast.success('Owner updated');
    } catch {
      toast.error('Failed to update owner');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full sm:w-64">
      <Select
        items={items}
        value={owner?.id ?? UNASSIGNED}
        onValueChange={handleChange}
        disabled={saving}
      >
        <SelectTrigger aria-label="Control owner">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
