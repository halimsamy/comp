'use client';

import { SelectAssignee } from '@/components/SelectAssignee';
import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { usePermissions } from '@/hooks/use-permissions';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, Text } from '@trycompai/design-system';
import { toast } from 'sonner';
import { useFormStatuses } from './use-form-settings';

const CADENCES = [1, 3, 6, 12, 24];
export const cadenceLabel = (months: number) =>
  months === 1 ? 'Monthly' : months === 12 ? 'Yearly' : months === 24 ? 'Every 2 years' : `Every ${months} months`;

/** Owner and review cadence of one company form, on its page (#50). */
export function FormOwnerSettings({ organizationId, formType }: { organizationId: string; formType: string }) {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('evidence', 'update');
  const { members } = useOrganizationMembers();
  const { statuses, updateSetting } = useFormStatuses(organizationId);
  const status = statuses?.[formType];
  if (!status) return null;

  const handleChange = async (change: { ownerMemberId?: string | null; cadenceMonthsOverride?: number | null }) => {
    try {
      await updateSetting({ formType, ...change });
      toast.success('Form settings updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update the form');
    }
  };

  const cadence = status.cadenceMonthsOverride ?? 'default';
  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        <Label>Owner</Label>
        <SelectAssignee
          assignees={members ?? []}
          assigneeId={status.ownerMemberId ?? null}
          onAssigneeChange={(id) => handleChange({ ownerMemberId: id || null })}
          disabled={!canEdit}
          withTitle={false}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Review cadence</Label>
        <Select
          value={String(cadence)}
          disabled={!canEdit}
          onValueChange={(value) =>
            handleChange({ cadenceMonthsOverride: value === 'default' ? null : Number(value) })
          }
        >
          <SelectTrigger>
            {cadence === 'default'
              ? `Default (${cadenceLabel(status.cadenceMonths ?? 12).toLowerCase()})`
              : cadenceLabel(cadence)}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            {CADENCES.map((months) => (
              <SelectItem key={months} value={String(months)}>
                {cadenceLabel(months)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Next due</Label>
        <Text size="sm" variant={status.status === 'overdue' ? 'destructive' : 'muted'}>
          {status.nextDueAt
            ? new Date(status.nextDueAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : 'After the first submission'}
        </Text>
      </div>
    </div>
  );
}
