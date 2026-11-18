'use client';

import {
  PageHeader,
  PageLayout,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@trycompai/design-system';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import type { ReactNode } from 'react';
import { RiskActionTracker } from './RiskActionTracker';
import { RiskLibrary } from './RiskLibrary';
import { RiskReviews } from './RiskReviews';
import type { WorkspaceMember } from './workspace-types';

const TABS = ['register', 'actions', 'library', 'reviews'] as const;

/**
 * The Risks page as a workspace (Vanta-style): the register, the treatment
 * action tracker across risks, the risk library with AI suggestions, and the
 * periodic review history. The active tab lives in `?tab=`.
 */
export function RiskWorkspaceTabs({
  orgId,
  register,
  actions,
  members,
}: {
  orgId: string;
  register: ReactNode;
  actions: ReactNode;
  members: WorkspaceMember[];
}) {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringLiteral(TABS).withDefault('register'),
  );

  const handleTabChange = (value: string) => {
    const next = TABS.find((candidate) => candidate === value) ?? 'register';
    void setTab(next === 'register' ? null : next);
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <PageLayout
        header={
          <PageHeader
            title="Risks"
            actions={actions}
            tabs={
              <TabsList variant="underline">
                <TabsTrigger value="register">Register</TabsTrigger>
                <TabsTrigger value="actions">Action tracker</TabsTrigger>
                <TabsTrigger value="library">Library</TabsTrigger>
                <TabsTrigger value="reviews">Reviews</TabsTrigger>
              </TabsList>
            }
          />
        }
      >
        <TabsContent value="register">{register}</TabsContent>
        <TabsContent value="actions">
          {tab === 'actions' && <RiskActionTracker orgId={orgId} members={members} />}
        </TabsContent>
        <TabsContent value="library">
          {tab === 'library' && <RiskLibrary />}
        </TabsContent>
        <TabsContent value="reviews">
          {tab === 'reviews' && <RiskReviews orgId={orgId} members={members} />}
        </TabsContent>
      </PageLayout>
    </Tabs>
  );
}
