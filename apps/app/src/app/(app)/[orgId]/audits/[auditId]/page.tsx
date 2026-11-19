import type { Audit } from '@/hooks/use-audits';
import { serverApi } from '@/lib/api-server';
import { PageLayout } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuditWorkspace } from './components/AuditWorkspace';
import { toCompanyContext } from './lib/company-context';

export const metadata: Metadata = { title: 'Audit' };

export default async function AuditPage({
  params,
}: {
  params: Promise<{ orgId: string; auditId: string }>;
}) {
  const { orgId, auditId } = await params;
  const [res, orgRes, contextRes] = await Promise.all([
    serverApi.get<Audit>(`/v1/audits/${auditId}`),
    serverApi.get<{ name: string; logoUrl: string | null }>('/v1/organization'),
    serverApi.get<{ data: Array<{ question: string; answer: string }> }>('/v1/context'),
  ]);
  if (!res.data) notFound();
  const entries = contextRes.data?.data;
  const company = toCompanyContext({
    organization: orgRes.data,
    entries: Array.isArray(entries) ? entries : [],
  });

  return (
    <PageLayout>
      <AuditWorkspace orgId={orgId} initialAudit={res.data} company={company} />
    </PageLayout>
  );
}
