import type { Audit } from '@/hooks/use-audits';
import { serverApi } from '@/lib/api-server';
import { PageLayout } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { AuditsClient } from './components/AuditsClient';
import { fetchAuditOptions } from './lib/audit-options';

export const metadata: Metadata = { title: 'Audits' };

export default async function AuditsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const [auditsRes, options] = await Promise.all([
    serverApi.get<{ data: Audit[] }>('/v1/audits'),
    fetchAuditOptions(),
  ]);
  const audits = auditsRes.data?.data;

  return (
    <PageLayout>
      <AuditsClient
        orgId={orgId}
        initialAudits={Array.isArray(audits) ? audits : undefined}
        frameworks={options.frameworks}
        auditors={options.auditors}
      />
    </PageLayout>
  );
}
