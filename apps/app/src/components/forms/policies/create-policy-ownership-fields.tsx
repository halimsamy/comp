'use client';

import { SelectAssignee } from '@/components/SelectAssignee';
import { useOrganizationMembers } from '@/hooks/use-organization-members';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
} from '@trycompai/design-system';
import { Controller, type Control } from 'react-hook-form';
import { REVIEW_FREQUENCIES, type CreatePolicyFormValues } from './create-new-policy';

const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Owner, approver and review frequency asked up front (ISO 27001 5.1, PCI DSS 12.1.2). */
export function CreatePolicyOwnershipFields({
  control,
}: {
  control: Control<CreatePolicyFormValues>;
}) {
  const { members } = useOrganizationMembers();
  const active = (members ?? []).filter((member) => !member.deactivated);

  return (
    <>
      <Stack gap="xs">
        <Label>Owner</Label>
        <Controller
          control={control}
          name="ownerId"
          render={({ field }) => (
            <SelectAssignee
              assigneeId={field.value}
              assignees={active}
              onAssigneeChange={field.onChange}
              withTitle={false}
            />
          )}
        />
        <Text size="xs" variant="muted">
          Defaults to you when left empty.
        </Text>
      </Stack>
      <Stack gap="xs">
        <Label>Approver</Label>
        <Controller
          control={control}
          name="approverId"
          render={({ field }) => (
            <SelectAssignee
              assigneeId={field.value}
              assignees={active}
              onAssigneeChange={field.onChange}
              withTitle={false}
            />
          )}
        />
      </Stack>
      <Stack gap="xs">
        <Label>Review frequency</Label>
        <Controller
          control={control}
          name="frequency"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
              <SelectTrigger>
                <SelectValue>{label(field.value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REVIEW_FREQUENCIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {label(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Stack>
    </>
  );
}
