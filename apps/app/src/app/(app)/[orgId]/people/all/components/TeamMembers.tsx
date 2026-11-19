import { serverApi } from '@/lib/server-api-client';
import type { Invitation, Member, User } from '@db';
import { getEmployeeSyncConnections } from '../data/queries';
import { type MemberCompliance, taskCompletionFrom, tracks } from '../lib/people-compliance';
import { TeamMembersClient } from './TeamMembersClient';
import type { BackgroundCheckStatus } from '../../[employeeId]/components/backgroundCheckTypes';
import {
  buildTwoFactorStatusMap,
  type TwoFactorStatusesResponse,
} from './two-factor-status-map';

export type { BackgroundCheckStatus };
export type { TwoFactorStatus } from './two-factor-status-map';

export interface MemberWithUser extends Member {
  user: User;
  backgroundCheckRequests?: BackgroundCheckSummary[];
}

export interface BackgroundCheckSummary {
  id: string;
  status: BackgroundCheckStatus;
}

export interface TeamMembersData {
  members: MemberWithUser[];
  pendingInvitations: Invitation[];
}

export interface TaskCompletion {
  completed: number;
  total: number;
  policies: { completed: number; total: number };
  training: { completed: number; total: number };
  hipaa?: { completed: number; total: number };
}

export type DeviceStatus = 'compliant' | 'non-compliant' | 'not-installed';

export interface TeamMembersProps {
  canManageMembers: boolean;
  canInviteUsers: boolean;
  isCurrentUserOwner: boolean;
  organizationId: string;
}

export async function TeamMembers(props: TeamMembersProps) {
  const {
    canManageMembers,
    canInviteUsers,
    isCurrentUserOwner,
    organizationId,
  } = props;

  if (!organizationId) {
    return null;
  }

  // Fetch members, invitations, and 2FA statuses from API
  const [membersRes, invitationsRes, twoFactorRes] = await Promise.all([
    serverApi.get<{ data: MemberWithUser[]; count: number }>(
      '/v1/people?includeDeactivated=true',
    ),
    serverApi.get<{ data: Invitation[] }>('/v1/auth/invitations'),
    serverApi.get<TwoFactorStatusesResponse>(
      '/v1/integrations/sync/two-factor-statuses',
    ),
  ]);

  const members: MemberWithUser[] = Array.isArray(membersRes.data?.data)
    ? membersRes.data.data
    : [];
  const pendingInvitations: Invitation[] = Array.isArray(invitationsRes.data?.data)
    ? invitationsRes.data.data
    : [];

  const data: TeamMembersData = { members, pendingInvitations };

  // Empty when no 2FA source is configured (or the fetch failed) — rows then
  // show no 2FA entry rather than a wrong one.
  const twoFactorStatusMap = buildTwoFactorStatusMap(
    members,
    twoFactorRes.data ?? undefined,
  );

  // Fetch employee sync connections server-side
  const employeeSyncData = await getEmployeeSyncConnections(organizationId);

  // #87: one compliance source for the table (policies, training, device,
  // background check, checklists), computed by the API.
  const complianceRes = await serverApi.get<{ data: MemberCompliance[] }>(
    '/v1/people-lifecycle/compliance',
  );
  const compliance: MemberCompliance[] = Array.isArray(complianceRes.data?.data)
    ? complianceRes.data.data
    : [];
  const complianceMap = Object.fromEntries(compliance.map((e) => [e.member.id, e]));
  const current = compliance.filter((e) => !e.member.former);
  const complianceMemberIds = current.map((e) => e.member.id);
  const taskCompletionMap: Record<string, TaskCompletion> = Object.fromEntries(
    current.map((e) => [e.member.id, taskCompletionFrom(e)]),
  );
  const backgroundCheckStepEnabled = tracks({ entries: current, key: 'background_check' });
  // The training item already counts HIPAA training, so there is no separate HIPAA column.
  const requirementTracking = {
    policies: tracks({ entries: current, key: 'policies' }),
    training: tracks({ entries: current, key: 'training' }),
    hipaa: false,
  };

  return (
    <TeamMembersClient
      data={data}
      organizationId={organizationId}
      canManageMembers={canManageMembers}
      canInviteUsers={canInviteUsers}
      isCurrentUserOwner={isCurrentUserOwner}
      employeeSyncData={employeeSyncData}
      taskCompletionMap={taskCompletionMap}
      complianceMemberIds={complianceMemberIds}
      complianceMap={complianceMap}
      backgroundCheckStepEnabled={backgroundCheckStepEnabled}
      twoFactorStatusMap={twoFactorStatusMap}
      requirementTracking={requirementTracking}
    />
  );
}
