import { PageHeader, PageHeaderDescription, PageLayout, Stack } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { GettingStarted } from './components/GettingStarted';

export const metadata: Metadata = { title: 'Getting started' };

export default async function GettingStartedPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <PageLayout>
      <Stack gap="md">
        <PageHeader title="Getting started">
          <PageHeaderDescription>
            Set up your ISO 27001 and PCI DSS program step by step. Steps complete on their own as
            you connect systems, publish policies and collect evidence.
          </PageHeaderDescription>
        </PageHeader>
        <GettingStarted organizationId={orgId} />
      </Stack>
    </PageLayout>
  );
}
