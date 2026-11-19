import { redirect } from 'next/navigation';

/** Findings moved to the one issue register under Audits; old links (emails, bookmarks) still land there. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ open?: string }>;
}) {
  const [{ orgId }, { open }] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams({ tab: 'findings' });
  if (open) query.set('open', open);
  redirect(`/${orgId}/audits?${query.toString()}`);
}
