import type { AssetsResponse } from '@/hooks/use-assets';
import { serverApi } from '@/lib/api-server';
import { PageLayout } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { AssetsClient } from './components/AssetsClient';
import { fetchMemberOptions, fetchVendorOptions } from './lib/member-options';

export const metadata: Metadata = { title: 'Assets' };

export default async function AssetsPage() {
  const [assetsRes, memberOptions, vendorOptions] = await Promise.all([
    serverApi.get<AssetsResponse>('/v1/assets'),
    fetchMemberOptions(),
    fetchVendorOptions(),
  ]);
  const initial = assetsRes.data;

  return (
    <PageLayout>
      <AssetsClient
        initialData={
          initial && Array.isArray(initial.data)
            ? {
                data: initial.data,
                review: initial.review ?? { lastReviewedAt: null, reviewedBy: null },
                formImport: initial.formImport ?? null,
              }
            : undefined
        }
        memberOptions={memberOptions}
        vendorOptions={vendorOptions}
      />
    </PageLayout>
  );
}
