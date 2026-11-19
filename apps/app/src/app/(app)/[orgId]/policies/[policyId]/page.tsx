import { getFeatureFlags } from '@/app/posthog';
import { filterAppAccessMembers } from '@/lib/compliance';
import { serverApi } from '@/lib/api-server';
import { auth } from '@/utils/auth';
import type {
  AuditLog,
  Member,
  Organization,
  Policy,
  PolicyVersion,
  User,
} from '@db';
import { Breadcrumb, PageLayout } from '@trycompai/design-system';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { PolicyHeaderActions } from './components/PolicyHeaderActions';
import PolicyPage from './components/PolicyPage';
import { getPolicyStage } from '../lib/policy-stage';
import { PolicyStatusBadge } from './components/PolicyStatusBadge';

type PolicyDetail = Policy & {
  approver: (Member & { user: User }) | null;
  assignee: (Member & { user: User }) | null;
  currentVersion:
    | (PolicyVersion & {
        publishedBy: (Member & { user: User }) | null;
      })
    | null;
};

type PolicyVersionWithPublisher = PolicyVersion & {
  publishedBy: (Member & { user: User }) | null;
};

type AuditLogWithRelations = AuditLog & {
  user: User | null;
  member: Member | null;
  organization: Organization;
};

export default async function PolicyDetails({
  params,
}: {
  params: Promise<{ policyId: string; orgId: string }>;
}) {
  const { policyId, orgId } = await params;

  const [policyRes, membersRes, activityRes, versionsRes] =
    await Promise.all([
      serverApi.get<PolicyDetail>(`/v1/policies/${policyId}`),
      serverApi.get<{ data: (Member & { user: User })[] }>('/v1/people'),
      serverApi.get<{ data: AuditLogWithRelations[] }>(
        `/v1/audit-logs?entityType=policy&entityId=${policyId}`,
      ),
      serverApi.get<{
        data: {
          versions: PolicyVersionWithPublisher[];
          currentVersionId: string | null;
          pendingVersionId: string | null;
        };
      }>(`/v1/policies/${policyId}/versions`),
    ]);

  const policy = policyRes.data ?? null;
  const allMembers = Array.isArray(membersRes.data?.data)
    ? membersRes.data.data
    : [];
  // Filter to assignable members (only those with app access, exclude deactivated)
  const activeMembers = allMembers.filter((m) => !m.deactivated);
  const assignees = await filterAppAccessMembers(activeMembers, orgId);
  const logs = Array.isArray(activityRes.data?.data)
    ? activityRes.data.data
    : [];
  const versions = versionsRes.data?.data?.versions ?? [];
  const isPendingApproval = !!policy?.approverId && !!policy?.pendingVersionId;

  // Check feature flag for AI policy editor
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const flags = session?.user?.id
    ? await getFeatureFlags(session.user.id)
    : {};
  const isAiPolicyEditorEnabled =
    flags['is-ai-policy-assistant-enabled'] === true ||
    flags['is-ai-policy-assistant-enabled'] === 'true';

  return (
    <PageLayout>
      <Breadcrumb
        items={[
          {
            label: 'Policies',
            href: `/${orgId}/policies`,
            props: { render: <Link href={`/${orgId}/policies`} /> },
          },
          { label: policy?.name ?? 'Policy', isCurrent: true },
        ]}
      />
      <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {policy?.name ?? 'Policy'}
          </h1>
          {policy && (
            <PolicyStatusBadge stage={getPolicyStage(policy)} isArchived={policy.isArchived} />
          )}
        </div>
        <PolicyHeaderActions policy={policy} organizationId={orgId} />
      </div>
      <PolicyPage
        policy={policy}
        policyId={policyId}
        organizationId={orgId}
        assignees={assignees}
        isPendingApproval={isPendingApproval}
        logs={logs}
        versions={versions}
        showAiAssistant={isAiPolicyEditorEnabled}
      />
    </PageLayout>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Policy Overview',
  };
}
