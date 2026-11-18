import type { Asset } from '@/hooks/use-assets';
import { serverApi } from '@/lib/api-server';
import { PageLayout } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { AssetsClient } from './components/AssetsClient';
import { fetchMemberOptions } from './lib/member-options';

export const metadata: Metadata = { title: 'Assets' };

export default async function AssetsPage() {
  const [assetsRes, memberOptions] = await Promise.all([
    serverApi.get<{ data: Asset[] }>('/v1/assets'),
    fetchMemberOptions(),
  ]);
  const assets = assetsRes.data?.data;

  return (
    <PageLayout>
      <AssetsClient
        initialAssets={Array.isArray(assets) ? assets : undefined}
        memberOptions={memberOptions}
      />
    </PageLayout>
  );
}
