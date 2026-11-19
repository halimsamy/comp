'use client';

import { useVendorRegisterActions } from '@/hooks/use-vendor-register';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';
import { CRITICALITY_OPTIONS } from '../../lib/vendor-tpsp';

interface Owner {
  id: string;
  user: { name: string | null; email: string };
}

/** Bulk "Set owner" / "Set criticality" for the vendors selected in the table. */
export function VendorBulkBar({
  selectedIds,
  owners,
  onClear,
}: {
  selectedIds: string[];
  owners: Owner[];
  onClear: () => void;
}) {
  const { bulkUpdateVendors } = useVendorRegisterActions();
  const [busy, setBusy] = useState(false);
  if (selectedIds.length === 0) return null;

  const handleApply = async (change: { assigneeId?: string; criticality?: string }, label: string) => {
    setBusy(true);
    try {
      await bulkUpdateVendors(
        selectedIds.map((id) => ({
          id,
          ...(change.assigneeId && { assigneeId: change.assigneeId }),
          ...(change.criticality && {
            criticality: change.criticality as (typeof CRITICALITY_OPTIONS)[number]['value'],
          }),
        })),
      );
      toast.success(`${label} for ${selectedIds.length} vendor${selectedIds.length === 1 ? '' : 's'}`);
      onClear();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Bulk update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <span className="text-sm font-medium">{selectedIds.length} selected</span>
      <div className="w-full sm:w-[200px]">
        <Select
          value=""
          disabled={busy}
          onValueChange={(value) => value && void handleApply({ assigneeId: value }, 'Owner set')}
        >
          <SelectTrigger aria-label="Set owner">
            <SelectValue placeholder="Set owner…" />
          </SelectTrigger>
          <SelectContent>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.user.name || owner.user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-full sm:w-[180px]">
        <Select
          value=""
          disabled={busy}
          onValueChange={(value) =>
            value && void handleApply({ criticality: value }, 'Criticality set')
          }
        >
          <SelectTrigger aria-label="Set criticality">
            <SelectValue placeholder="Set criticality…" />
          </SelectTrigger>
          <SelectContent>
            {CRITICALITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
        Clear selection
      </Button>
    </div>
  );
}
