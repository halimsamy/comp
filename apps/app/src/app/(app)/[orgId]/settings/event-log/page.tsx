import { requireRoutePermission } from '@/lib/permissions.server';
import type { Metadata } from 'next';
import { EventLog } from './components/EventLog';

export default async function EventLogPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireRoutePermission('settings/event-log', orgId);
  return <EventLog />;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Event Log' };
}
