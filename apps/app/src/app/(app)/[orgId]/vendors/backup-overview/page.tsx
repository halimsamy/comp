import { redirect } from 'next/navigation';

/** Retired page: vendors live on /vendors. */
export default async function VendorsBackupOverviewPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/${orgId}/vendors`);
}
