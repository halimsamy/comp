import { serverApi } from '@/lib/api-server';
import { filterAppAccessMembers } from '@/lib/compliance';
import type { Member, User } from '@db';
import { PageHeader, PageLayout, Stack } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PolicyFilters } from '../all/components/PolicyFilters';
import { PolicyPageActions } from '../all/components/PolicyPageActions';
import { isArchivedPolicy } from '../lib/policy-archive-state';
import type { PolicyRegisterRow } from '../lib/policy-register';
import { PolicyChartsClient } from './components/PolicyChartsClient';
import { computePoliciesOverview } from './lib/compute-overview';
import Loading from './loading';

interface PoliciesPageProps {
  params: Promise<{ orgId: string }>;
}

export default async function PoliciesPage({ params }: PoliciesPageProps) {
  const { orgId } = await params;

  // ENG-108: fetch the active onboarding run id alongside policies so the
  // client-side filters component can subscribe and surface "tailoring your
  // policies…" status during first-run AI generation. Mirrors the pattern
  // used by the risks and vendors pages.
  const [policiesRes, onboardingRes, peopleRes] = await Promise.all([
    serverApi.get<{ data: PolicyRegisterRow[] }>('/v1/policies?includeArchived=true'),
    serverApi.get<{
      triggerJobId: string | null;
      triggerJobCompleted: boolean;
    } | null>('/v1/organization/onboarding'),
    serverApi.get<{ data: (Member & { user: User })[] }>('/v1/people'),
  ]);

  const policies = Array.isArray(policiesRes.data?.data)
    ? policiesRes.data.data
    : [];

  // Compute overview from policies (same logic used client-side)
  const initialOverview = computePoliciesOverview(policies);
  const people = Array.isArray(peopleRes.data?.data) ? peopleRes.data.data : [];
  const members = await filterAppAccessMembers(
    people.filter((m) => !m.deactivated),
    orgId,
  );

  return (
    <PageLayout>
      <Stack gap="md">
        <PageHeader
          title="Policies"
          actions={<PolicyPageActions policies={policies.filter((p) => !isArchivedPolicy(p))} />}
        />
        <Suspense fallback={<Loading />}>
          <PolicyChartsClient organizationId={orgId} initialData={initialOverview} />
        </Suspense>
        <PolicyFilters
          policies={policies}
          members={members}
          onboardingRunId={onboardingRes.data?.triggerJobId ?? null}
        />
      </Stack>
    </PageLayout>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Policies',
  };
}
