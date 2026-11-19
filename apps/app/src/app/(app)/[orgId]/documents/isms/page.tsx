import { PageHeader, PageLayout } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { IsmsOverview } from './components/overview/IsmsOverview';

export const metadata: Metadata = { title: 'ISMS' };

/**
 * The ISMS home (#53): readiness, the clause 4–10 documents and the Statement
 * of Applicability. The layout gates it on the ISMS flag and ISO 27001.
 */
export default async function IsmsIndexPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return (
    <PageLayout header={<PageHeader title="ISMS" />}>
      <IsmsOverview organizationId={orgId} />
    </PageLayout>
  );
}
