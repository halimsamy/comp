'use client';

import { Button, Checkbox, Text } from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';
import { OwnerSelect, UNASSIGNED_OWNER } from './OwnerSelect';

export type BulkSetOwner = (payload: {
  controlIds: string[];
  ownerId: string | null;
  assignLinkedWork?: boolean;
}) => Promise<{ controls: number; tasks: number; policies: number }>;

export function bulkResultMessage({ controls, tasks, policies }: { controls: number; tasks: number; policies: number }) {
  const extra = [tasks > 0 ? `${tasks} tasks` : '', policies > 0 ? `${policies} policies` : ''].filter(Boolean);
  return `Updated ${controls} control${controls === 1 ? '' : 's'}${extra.length ? `, assigned ${extra.join(' and ')}` : ''}`;
}

/** Shown while rows are selected: pick one owner for all of them. */
export function ControlsBulkBar({
  selectedIds,
  onClear,
  onApply,
}: {
  selectedIds: string[];
  onClear: () => void;
  onApply: BulkSetOwner;
}) {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [assignLinkedWork, setAssignLinkedWork] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleApply = async () => {
    setSaving(true);
    try {
      const result = await onApply({
        controlIds: selectedIds,
        ownerId,
        assignLinkedWork: !!ownerId && assignLinkedWork,
      });
      toast.success(bulkResultMessage(result));
      onClear();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update owners');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 lg:flex-row lg:items-center"
    >
      <Text size="sm" weight="medium">{`${selectedIds.length} selected`}</Text>
      <div className="w-full lg:w-56">
        <OwnerSelect
          label="New owner"
          placeholder="Pick an owner"
          value={touched ? (ownerId ?? UNASSIGNED_OWNER) : null}
          onChange={(next) => {
            setTouched(true);
            setOwnerId(next);
          }}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={assignLinkedWork}
          disabled={!ownerId}
          onCheckedChange={(checked) => setAssignLinkedWork(checked === true)}
        />
        <span className="text-sm">Also assign their unassigned tasks and policies</span>
      </label>
      <div className="flex gap-2 lg:ml-auto">
        <Button variant="ghost" size="sm" onClick={onClear} disabled={saving}>
          Clear
        </Button>
        <Button size="sm" onClick={handleApply} loading={saving} disabled={!touched}>
          Set owner
        </Button>
      </div>
    </div>
  );
}
