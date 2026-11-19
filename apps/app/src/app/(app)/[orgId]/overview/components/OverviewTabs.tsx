'use client';

import { useFeatureFlag } from '@trycompai/analytics';
import { TabsList, TabsTrigger, Tabs } from '@trycompai/design-system';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

/**
 * Overview nav tabs. Renders link-based tabs so each sub-route (`/overview`,
 * `/overview/timeline`) paints without loading the other's data. Findings moved
 * to Audits → Findings, the one issue register (#171).
 */
export function OverviewTabs() {
  const { orgId } = useParams<{ orgId: string }>();
  const pathname = usePathname();
  const isTimelineEnabled = useFeatureFlag('is-timeline-enabled');

  const activeValue = pathname?.endsWith('/timeline') ? 'timeline' : 'overview';

  const overviewHref = `/${orgId}/overview`;
  const timelineHref = `/${orgId}/overview/timeline`;

  return (
    <Tabs value={activeValue}>
      <TabsList variant="underline">
        <TabsTrigger
          value="overview"
          nativeButton={false}
          render={<Link href={overviewHref} prefetch />}
        >
          Overview
        </TabsTrigger>
        {isTimelineEnabled && (
          <TabsTrigger
            value="timeline"
            nativeButton={false}
            render={<Link href={timelineHref} prefetch />}
          >
            Timeline
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  );
}
