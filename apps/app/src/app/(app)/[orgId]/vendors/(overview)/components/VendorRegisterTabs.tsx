'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@trycompai/design-system';
import { useQueryState } from 'nuqs';
import type { ReactNode } from 'react';
import { ArchivedVendors } from './ArchivedVendors';

/** "Active" register (children) and the "Archived" vendors list. */
export function VendorRegisterTabs({ orgId, children }: { orgId: string; children: ReactNode }) {
  const [view, setView] = useQueryState('view', { defaultValue: 'active' });
  return (
    <Tabs value={view} onValueChange={(next) => void setView(String(next))}>
      <TabsList variant="underline">
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="archived">Archived</TabsTrigger>
      </TabsList>
      {view === 'archived' ? (
        <TabsContent value="archived">
          <ArchivedVendors orgId={orgId} />
        </TabsContent>
      ) : (
        <TabsContent value="active">{children}</TabsContent>
      )}
    </Tabs>
  );
}
