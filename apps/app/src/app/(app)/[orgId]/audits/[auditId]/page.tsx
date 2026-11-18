import type { Audit } from '@/hooks/use-audits';
import { serverApi } from '@/lib/api-server';
import { PageLayout } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuditWorkspace } from './components/AuditWorkspace';

export const metadata: Metadata = { title: 'Audit' };

export default async function AuditPage({
  params,
}: {
  params: Promise<{ orgId: string; auditId: string }>;
}) {
  const { orgId, auditId } = await params;
  const res = await serverApi.get<Audit>(`/v1/audits/${auditId}`);
  if (!res.data) notFound();

  return (
    <PageLayout>
      <AuditWorkspace orgId={orgId} initialAudit={res.data} />
    </PageLayout>
  );
}
