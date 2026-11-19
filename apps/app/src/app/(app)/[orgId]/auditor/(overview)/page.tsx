import type { Audit } from '@/hooks/use-audits';
import { serverApi } from '@/lib/api-server';
import { redirect } from 'next/navigation';

/**
 * The auditor view now lives in each audit's workspace (#193): one engagement
 * opens it directly, otherwise the auditor picks one from Audits.
 */
export default async function AuditorPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const res = await serverApi.get<{ data: Audit[] }>('/v1/audits');
  const audits = Array.isArray(res.data?.data) ? res.data.data : [];
  redirect(audits.length === 1 ? `/${orgId}/audits/${audits[0].id}` : `/${orgId}/audits`);
}
