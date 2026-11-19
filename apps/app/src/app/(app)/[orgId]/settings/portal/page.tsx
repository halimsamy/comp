import { redirect } from 'next/navigation';

/** #98: the employee portal toggles live in People settings now. */
export default async function PortalSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  redirect(`/${orgId}/people?tab=settings`);
}
