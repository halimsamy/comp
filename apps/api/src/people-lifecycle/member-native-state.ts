import { NotFoundException } from '@nestjs/common';
import { BackgroundCheckStatus, db } from '@db';
import {
  GENERAL_TRAINING_VIDEO_IDS,
  HIPAA_TRAINING_ID,
  hipaaFrameworkInstanceWhere,
} from '@trycompai/company';
import { moduleStatuses } from './native-state-modules';

const COMPLETED_BACKGROUND_CHECK: BackgroundCheckStatus[] = ['completed', 'completed_with_flags'];

export function isAuditorOnly(role: string): boolean {
  const roles = role
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  return roles.length > 0 && roles.every((r) => r === 'auditor');
}

function latest(dates: (Date | null)[]): Date | null {
  const valid = dates.filter((d): d is Date => d !== null);
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

function earliest(dates: (Date | null)[]): Date | null {
  const valid = dates.filter((d): d is Date => d !== null);
  if (valid.length === 0) return null;
  return new Date(Math.min(...valid.map((d) => d.getTime())));
}

const TRAINING_IDS = [...GENERAL_TRAINING_VIDEO_IDS, HIPAA_TRAINING_ID];

/**
 * Everything the platform already knows about members' people-security
 * obligations, loaded in a fixed number of queries for any number of members.
 * The single source for the member page, the People table and the overview.
 */
export async function loadNativeStates({
  organizationId,
  memberIds,
  now = new Date(),
}: {
  organizationId: string;
  /** Omit for every member of the organization. */
  memberIds?: string[];
  now?: Date;
}) {
  const members = await db.member.findMany({
    where: { organizationId, ...(memberIds && { id: { in: memberIds } }) },
    include: {
      user: { select: { name: true, email: true, role: true } },
      backgroundCheckRequests: {
        select: { status: true, completedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  const ids = members.map((m) => m.id);
  const [org, policies, videos, devices, hipaa, modules, expiredCycles] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        securityTrainingStepEnabled: true,
        deviceAgentStepEnabled: true,
        backgroundCheckStepEnabled: true,
      },
    }),
    db.policy.findMany({
      where: { organizationId, status: 'published', isRequiredToSign: true, isArchived: false },
      select: { id: true, name: true, signedBy: true, visibility: true, visibleToDepartments: true },
      orderBy: { name: 'asc' },
    }),
    db.employeeTrainingVideoCompletion.findMany({
      where: { memberId: { in: ids }, completedAt: { not: null } },
      select: { memberId: true, videoId: true, completedAt: true },
    }),
    db.device.findMany({
      where: { organizationId, memberId: { in: ids }, source: { not: 'integration' } },
      select: { memberId: true, name: true, isCompliant: true },
    }),
    db.frameworkInstance.findFirst({
      where: hipaaFrameworkInstanceWhere(organizationId),
      select: { id: true },
    }),
    moduleStatuses({ organizationId, members, now }),
    // A lapsed 12-month cycle means the outstanding training is a renewal, not a first run.
    db.trainingCompletionRecord.findMany({
      where: { organizationId, memberId: { in: ids }, moduleId: { in: TRAINING_IDS }, expiresAt: { lte: now } },
      select: { memberId: true },
      distinct: ['memberId'],
    }),
  ]);
  const flags = org ?? {
    securityTrainingStepEnabled: false,
    deviceAgentStepEnabled: false,
    backgroundCheckStepEnabled: false,
  };
  const expired = new Set(expiredCycles.map((r) => r.memberId));

  return members.map((member) => {
    const videoDate = (id: string) =>
      videos.find((v) => v.memberId === member.id && v.videoId === id)?.completedAt ?? null;
    const generalDates = GENERAL_TRAINING_VIDEO_IDS.map(videoDate);
    const memberPolicies = policies.filter(
      (p) => p.visibility === 'ALL' || (p.visibility === 'DEPARTMENT' && (p.visibleToDepartments as string[]).includes(member.department)),
    );
    const pendingPolicies = memberPolicies.filter((p) => !p.signedBy.includes(member.id));
    const memberDevices = devices.filter((d) => d.memberId === member.id);
    const check = member.backgroundCheckRequests[0] ?? null;
    return {
      member: { ...member, organization: flags },
      policies: {
        required: memberPolicies.length,
        accepted: memberPolicies.length - pendingPolicies.length,
        pending: pendingPolicies.map((p) => ({ id: p.id, name: p.name })),
      },
      training: {
        generalRequired: flags.securityTrainingStepEnabled,
        generalCompleted: generalDates.filter(Boolean).length,
        generalTotal: GENERAL_TRAINING_VIDEO_IDS.length,
        generalCompletedAt: generalDates.every(Boolean) ? latest(generalDates) : null,
        // Each video expires 12 months after it was watched, so the oldest one sets the renewal date.
        generalOldestAt: generalDates.every(Boolean) ? earliest(generalDates) : null,
        hadExpiredCycle: expired.has(member.id),
        hipaaRequired: !!hipaa,
        hipaaCompletedAt: videoDate(HIPAA_TRAINING_ID),
        modules: modules.get(member.id) ?? [],
      },
      device: {
        required: flags.deviceAgentStepEnabled,
        enrolled: memberDevices.length > 0 || member.fleetDmLabelId !== null,
        compliant: memberDevices.some((d) => d.isCompliant),
        name: memberDevices[0]?.name ?? null,
      },
      backgroundCheck: {
        required: flags.backgroundCheckStepEnabled && !member.backgroundCheckExempt && !isAuditorOnly(member.role),
        status: check?.status ?? null,
        completed: !!check && COMPLETED_BACKGROUND_CHECK.includes(check.status),
        completedAt: check?.completedAt ?? null,
        exempt: member.backgroundCheckExempt,
        exemptReason: member.backgroundCheckExemptReason,
      },
    };
  });
}

/** One member's native state; 404 when the member is not in the organization. */
export async function getMemberNativeState({
  organizationId,
  memberId,
}: {
  organizationId: string;
  memberId: string;
}) {
  const [state] = await loadNativeStates({ organizationId, memberIds: [memberId] });
  if (!state) throw new NotFoundException('Member not found');
  return state;
}

export type MemberNativeState = Awaited<ReturnType<typeof loadNativeStates>>[number];

export function isTrainingDone(state: MemberNativeState): boolean {
  const t = state.training;
  const generalOk = !t.generalRequired || t.generalCompletedAt !== null;
  const hipaaOk = !t.hipaaRequired || t.hipaaCompletedAt !== null;
  return generalOk && hipaaOk && t.modules.every((m) => m.status === 'completed');
}

export interface AutoCompletion {
  done: boolean;
  /** Known completion date, when the platform records one. */
  completedAt: Date | null;
}

/** Whether an auto-completing checklist item is satisfied by native state. */
export function autoCompletion({
  state,
  source,
}: {
  state: MemberNativeState;
  source: string;
}): AutoCompletion {
  switch (source) {
    case 'policies':
      return { done: state.policies.accepted === state.policies.required, completedAt: null };
    case 'training': {
      const done = isTrainingDone(state);
      const completedAt = latest([
        state.training.generalCompletedAt,
        state.training.hipaaCompletedAt,
        ...state.training.modules.map((m) => m.completedAt),
      ]);
      return { done, completedAt: done ? completedAt : null };
    }
    case 'device':
      return { done: !state.device.required || state.device.compliant, completedAt: null };
    case 'background_check':
      if (state.backgroundCheck.completed) {
        return { done: true, completedAt: state.backgroundCheck.completedAt };
      }
      return { done: !state.backgroundCheck.required, completedAt: null };
    default:
      return { done: false, completedAt: null };
  }
}
