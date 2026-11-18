import { redirect } from 'next/navigation';

/** /people/access lives as a tab of the People page. */
export default async function AccessPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  redirect(`/${orgId}/people?tab=access`);
}
