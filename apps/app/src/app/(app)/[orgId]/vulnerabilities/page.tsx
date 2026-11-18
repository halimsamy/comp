import type { Asset } from '@/hooks/use-assets';
import type { Vulnerability } from '@/hooks/use-vulnerabilities';
import { serverApi } from '@/lib/api-server';
import { PageLayout } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { fetchMemberOptions } from '../assets/lib/member-options';
import { VulnerabilitiesClient } from './components/VulnerabilitiesClient';

export const metadata: Metadata = { title: 'Vulnerabilities' };

export default async function VulnerabilitiesPage() {
  const [vulnRes, assetsRes, memberOptions] = await Promise.all([
    serverApi.get<{ data: Vulnerability[] }>('/v1/vulnerabilities'),
    serverApi.get<{ data: Asset[] }>('/v1/assets'),
    fetchMemberOptions(),
  ]);
  const vulnerabilities = vulnRes.data?.data;
  const assets = Array.isArray(assetsRes.data?.data) ? assetsRes.data.data : [];

  return (
    <PageLayout>
      <VulnerabilitiesClient
        initialVulnerabilities={Array.isArray(vulnerabilities) ? vulnerabilities : undefined}
        assets={assets.map(({ id, name }) => ({ id, name }))}
        memberOptions={memberOptions}
      />
    </PageLayout>
  );
}
