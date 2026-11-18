'use client';

import { api } from '@/lib/api-client';
import { useActiveMember } from '@/utils/auth-client';
import { Badge, Button, HStack } from '@trycompai/design-system';
import { CheckmarkOutline } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import type { IsmsRoleAssignment } from '../isms-types';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Acknowledgement state for one role holder (ISO 27001 5.3, PCI DSS 12.4.1).
 * Only the holder sees the Acknowledge button; everyone else sees the status.
 */
export function RoleAcknowledgement({ assignment }: { assignment: IsmsRoleAssignment }) {
  const { data: activeMember } = useActiveMember();
  const { mutate } = useSWRConfig();
  const [isSaving, setIsSaving] = useState(false);

  if (assignment.acknowledgedAt) {
    return <Badge variant="outline">Acknowledged {formatDate(assignment.acknowledgedAt)}</Badge>;
  }

  const isHolder = activeMember?.id === assignment.memberId;

  const handleAcknowledge = async () => {
    setIsSaving(true);
    const response = await api.post(`/v1/isms/role-assignments/${assignment.id}/acknowledge`, {});
    setIsSaving(false);
    if (response.error) {
      toast.error(response.error);
      return;
    }
    toast.success('Role acknowledged');
    await mutate((key) => typeof key === 'string' && key.startsWith('/v1/isms/documents/'));
  };

  return (
    <HStack gap="2" align="center" wrap="wrap">
      <Badge variant="secondary">Awaiting acknowledgement</Badge>
      {isHolder ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={isSaving}
          iconLeft={<CheckmarkOutline size={16} />}
          onClick={() => void handleAcknowledge()}
        >
          I accept this role
        </Button>
      ) : null}
    </HStack>
  );
}
