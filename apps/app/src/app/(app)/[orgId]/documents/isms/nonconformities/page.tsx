import { serverApi } from '@/lib/api-server';
import { Breadcrumb, PageLayout, Stack } from '@trycompai/design-system';
import Link from 'next/link';
import type { ApproverOption } from '../components/IsmsApprovalSection';
import { NonconformityRegisterClient } from '../components/NonconformityRegisterClient';
import { IsmsPageHeader } from '../components/shared/IsmsPageHeader';
import type { IsmsNonconformityRow } from '../hooks/useNonconformities';

interface PeopleApiResponse {
  data: Array<{
    id: string;
    deactivated: boolean;
    user: { name: string | null; email: string } | null;
  }>;
}

export default async function IsmsNonconformitiesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const [peopleResult, registerResult] = await Promise.all([
    serverApi.get<PeopleApiResponse>('/v1/people'),
    serverApi.get<{ data: IsmsNonconformityRow[] }>('/v1/isms/nonconformities'),
  ]);

  // Without member:read the pickers are empty and names show as "Unassigned".
  const memberOptions: ApproverOption[] = (peopleResult.data?.data ?? [])
    .filter((person) => !person.deactivated)
    .map((person) => ({
      id: person.id,
      name: person.user?.name ?? person.user?.email ?? 'Unknown',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = registerResult.data?.data;

  return (
    <PageLayout>
      <Breadcrumb
        items={[
          {
            label: 'ISMS',
            href: `/${orgId}/documents/isms`,
            props: { render: <Link href={`/${orgId}/documents/isms`} /> },
          },
          { label: 'Nonconformities', isCurrent: true },
        ]}
      />
      <Stack gap="8">
        <IsmsPageHeader
          clause="10.2"
          title="Nonconformity & Corrective Action"
          description="Log each nonconformity, fix its cause and check the fix worked. Internal audit findings are included automatically."
          backHref={`/${orgId}/documents/isms`}
        />
        <NonconformityRegisterClient
          organizationId={orgId}
          fallbackData={Array.isArray(rows) ? rows : undefined}
          memberOptions={memberOptions}
        />
      </Stack>
    </PageLayout>
  );
}
