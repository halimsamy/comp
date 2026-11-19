'use client';

import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { useRoles } from '../../../settings/roles/hooks/useRoles';
import { canReviewAccess } from '../lib/reviewers';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@trycompai/design-system';
import { useMemo } from 'react';
import type { OwnerOption } from './AccountOwnerDialog';
import { AccessReviewsPanel } from './AccessReviewsPanel';
import { AccountsPanel } from './AccountsPanel';
import { RolesPanel } from './RolesPanel';

/** People > Access: access reviews and the account inventory per system. */
export function AccessTabContent({ orgId }: { orgId: string }) {
  const { members } = useOrganizationMembers();
  const { roles: customRoles } = useRoles();
  const active = useMemo(() => (Array.isArray(members) ? members : []).filter((m) => !m.deactivated), [members]);
  const options = useMemo<OwnerOption[]>(
    () => active.map((m) => ({ id: m.id, label: m.user.name || m.user.email })),
    [active],
  );
  const reviewers = useMemo<OwnerOption[]>(
    () =>
      active
        .filter((m) => canReviewAccess({ role: m.role, customRoles }))
        .map((m) => ({ id: m.id, label: m.user.name || m.user.email })),
    [active, customRoles],
  );

  return (
    <Tabs defaultValue="reviews">
      <div className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="reviews">Access reviews</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews">
          <AccessReviewsPanel orgId={orgId} members={reviewers} />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsPanel members={options} />
        </TabsContent>
        <TabsContent value="roles">
          <RolesPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}
