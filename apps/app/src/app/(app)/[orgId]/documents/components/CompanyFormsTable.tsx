'use client';

import { SelectAssignee } from '@/components/SelectAssignee';
import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Badge,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { cadenceLabel } from './FormOwnerSettings';
import type { FormDeadlineStatus, FormStatuses } from './use-form-settings';

type FormRow = { type: string; title: string; optional?: boolean };

const STATUS: Record<FormDeadlineStatus, { label: string; variant: 'accent' | 'outline' | 'destructive' | 'secondary' }> = {
  ok: { label: 'OK', variant: 'accent' },
  due_soon: { label: 'Due soon', variant: 'outline' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  never_submitted: { label: 'Not submitted', variant: 'outline' },
  not_relevant: { label: 'Not relevant', variant: 'secondary' },
};

/**
 * Documents table view (#50, #136): owner, cadence, frameworks and
 * OK / Due soon / Overdue per company form, with a bulk "Set owner".
 */
export function CompanyFormsTable({
  organizationId,
  forms,
  statuses,
  onBulkSetOwner,
}: {
  organizationId: string;
  forms: FormRow[];
  statuses: FormStatuses | undefined;
  onBulkSetOwner: (params: { formTypes: string[]; ownerMemberId: string | null }) => Promise<number>;
}) {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('evidence', 'update');
  const { members } = useOrganizationMembers();
  const [selected, setSelected] = useState<string[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const memberName = (id: string | null | undefined) => {
    const member = id ? members?.find((m) => m.id === id) : undefined;
    return member ? member.user.name || member.user.email : null;
  };
  const allSelected = forms.length > 0 && selected.length === forms.length;

  const handleToggle = (formType: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...new Set([...prev, formType])] : prev.filter((t) => t !== formType)));

  const handleApplyOwner = async () => {
    setIsSaving(true);
    try {
      const count = await onBulkSetOwner({ formTypes: selected, ownerMemberId: owner });
      toast.success(`Owner ${owner ? 'set' : 'cleared'} on ${count} form${count === 1 ? '' : 's'}`);
      setSelected([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to set the owner');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {canEdit && selected.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
          <Text size="sm">{`${selected.length} selected`}</Text>
          <div className="w-full sm:w-64">
            <SelectAssignee assignees={members ?? []} assigneeId={owner} onAssigneeChange={setOwner} withTitle={false} />
          </div>
          <Button size="sm" loading={isSaving} onClick={handleApplyOwner}>
            {owner ? 'Set owner' : 'Clear owner'}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead>
                  <Checkbox
                    aria-label="Select all forms"
                    checked={allSelected}
                    onCheckedChange={(checked) => setSelected(checked ? forms.map((f) => f.type) : [])}
                  />
                </TableHead>
              )}
              <TableHead>Form</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Frameworks</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Next due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forms.map((form) => {
              const status = statuses?.[form.type];
              const state = status?.status ? STATUS[status.status] : null;
              return (
                <TableRow key={form.type}>
                  {canEdit && (
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${form.title}`}
                        checked={selected.includes(form.type)}
                        onCheckedChange={(checked) => handleToggle(form.type, !!checked)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link href={`/${organizationId}/documents/${form.type}`} className="hover:underline">
                      <Text size="sm" weight="medium">
                        {form.title}
                      </Text>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Text size="sm" variant={memberName(status?.ownerMemberId) ? 'default' : 'muted'}>
                      {memberName(status?.ownerMemberId) ?? 'No owner'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text size="sm">{status?.cadenceMonths ? cadenceLabel(status.cadenceMonths) : '—'}</Text>
                  </TableCell>
                  <TableCell>
                    <Text size="sm" variant="muted">
                      {status?.frameworks?.length ? status.frameworks.join(', ') : '—'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {state ? (
                      <Badge variant={form.optional && status?.status === 'never_submitted' ? 'secondary' : state.variant}>
                        {form.optional && status?.status === 'never_submitted' ? 'Optional' : state.label}
                      </Badge>
                    ) : (
                      <Text size="sm" variant="muted">
                        —
                      </Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <Text size="sm" variant={status?.status === 'overdue' ? 'destructive' : 'muted'}>
                      {status?.nextDueAt ? new Date(status.nextDueAt).toLocaleDateString() : '—'}
                    </Text>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
