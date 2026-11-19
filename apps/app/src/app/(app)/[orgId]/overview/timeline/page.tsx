import { redirect } from 'next/navigation';

/** Each framework page shows its own timeline (#204); the overview no longer has a Timeline tab. */
export default async function TimelinePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  redirect(`/${orgId}/frameworks`);
}
