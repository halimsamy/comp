'use client';

import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@trycompai/design-system';
import { useMemo } from 'react';
import type { OwnerOption } from './AccountOwnerDialog';
import { AccessReviewsPanel } from './AccessReviewsPanel';
import { AccountsPanel } from './AccountsPanel';

/** People > Access: access reviews and the account inventory per system. */
export function AccessTabContent({ orgId }: { orgId: string }) {
  const { members } = useOrganizationMembers();
  const options = useMemo<OwnerOption[]>(
    () =>
      (Array.isArray(members) ? members : [])
        .filter((m) => !m.deactivated)
        .map((m) => ({ id: m.id, label: m.user.name || m.user.email })),
    [members],
  );

  return (
    <Tabs defaultValue="reviews">
      <div className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="reviews">Access reviews</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="reviews">
          <AccessReviewsPanel orgId={orgId} members={options} />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsPanel members={options} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
