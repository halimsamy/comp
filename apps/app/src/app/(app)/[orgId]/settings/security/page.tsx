import { requireRoutePermission } from '@/lib/permissions.server';
import type { Metadata } from 'next';
import { SecuritySettings } from './components/SecuritySettings';

export default async function SecuritySettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireRoutePermission('settings/security', orgId);
  return <SecuritySettings />;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Security Settings' };
}
