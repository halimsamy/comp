import { NotFoundException } from '@nestjs/common';
import { BackgroundCheckStatus, db } from '@db';
import {
  GENERAL_TRAINING_VIDEO_IDS,
  HIPAA_TRAINING_ID,
  hipaaFrameworkInstanceWhere,
} from '@trycompai/company';
import type { TrainingModulesService } from '../training/training-modules.service';

const COMPLETED_BACKGROUND_CHECK: BackgroundCheckStatus[] = [
  BackgroundCheckStatus.completed,
  BackgroundCheckStatus.completed_with_flags,
];

function isAuditorOnly(role: string): boolean {
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

/** Everything the platform already knows about one member's people-security obligations. */
export async function getMemberNativeState({
  organizationId,
  memberId,
  trainingModulesService,
}: {
  organizationId: string;
  memberId: string;
  trainingModulesService: TrainingModulesService;
}) {
  const member = await db.member.findFirst({
    where: { id: memberId, organizationId },
    include: {
      user: { select: { name: true, email: true } },
      organization: {
        select: {
          securityTrainingStepEnabled: true,
          deviceAgentStepEnabled: true,
          backgroundCheckStepEnabled: true,
        },
      },
      backgroundCheckRequests: {
        select: { status: true, completedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!member) throw new NotFoundException('Member not found');

  const [policies, videos, devices, hipaa, modules, expiredCycle] = await Promise.all([
    db.policy.findMany({
      where: {
        organizationId,
        status: 'published',
        isRequiredToSign: true,
        isArchived: false,
        OR: [
          { visibility: 'ALL' },
          { visibility: 'DEPARTMENT', visibleToDepartments: { has: member.department } },
        ],
      },
      select: { id: true, name: true, signedBy: true },
      orderBy: { name: 'asc' },
    }),
    db.employeeTrainingVideoCompletion.findMany({
      where: { memberId, completedAt: { not: null } },
      select: { videoId: true, completedAt: true },
    }),
    db.device.findMany({
      where: { organizationId, memberId, source: { not: 'integration' } },
      select: { name: true, isCompliant: true },
    }),
    db.frameworkInstance.findFirst({
      where: hipaaFrameworkInstanceWhere(organizationId),
      select: { id: true },
    }),
    trainingModulesService.getMemberModules({ organizationId, memberId }),
    // A lapsed 12-month cycle means the outstanding training is a renewal, not a first run.
    db.trainingCompletionRecord.findFirst({
      where: {
        organizationId,
        memberId,
        moduleId: { in: [...GENERAL_TRAINING_VIDEO_IDS, HIPAA_TRAINING_ID] },
        expiresAt: { lte: new Date() },
      },
      select: { id: true },
    }),
  ]);

  const flags = member.organization;
  const videoDate = (id: string) =>
    videos.find((v) => v.videoId === id)?.completedAt ?? null;
  const generalDates = GENERAL_TRAINING_VIDEO_IDS.map(videoDate);
  const check = member.backgroundCheckRequests[0] ?? null;
  const pendingPolicies = policies.filter((p) => !p.signedBy.includes(memberId));

  return {
    member,
    policies: {
      required: policies.length,
      accepted: policies.length - pendingPolicies.length,
      pending: pendingPolicies.map((p) => ({ id: p.id, name: p.name })),
    },
    training: {
      generalRequired: flags.securityTrainingStepEnabled,
      generalCompleted: generalDates.filter(Boolean).length,
      generalTotal: GENERAL_TRAINING_VIDEO_IDS.length,
      generalCompletedAt: generalDates.every(Boolean) ? latest(generalDates) : null,
      // Each video expires 12 months after it was watched, so the oldest one sets the renewal date.
      generalOldestAt: generalDates.every(Boolean) ? earliest(generalDates) : null,
      hadExpiredCycle: expiredCycle !== null,
      hipaaRequired: !!hipaa,
      hipaaCompletedAt: videoDate(HIPAA_TRAINING_ID),
      modules: modules.map((m) => ({
        id: m.id,
        title: m.title,
        frameworkReference: m.frameworkReference,
        status: m.status,
        completedAt: m.completedAt,
        expiresAt: m.expiresAt,
      })),
    },
    device: {
      required: flags.deviceAgentStepEnabled,
      enrolled: devices.length > 0 || member.fleetDmLabelId !== null,
      compliant: devices.some((d) => d.isCompliant),
      name: devices[0]?.name ?? null,
    },
    backgroundCheck: {
      required:
        flags.backgroundCheckStepEnabled &&
        !member.backgroundCheckExempt &&
        !isAuditorOnly(member.role),
      status: check?.status ?? null,
      completed: !!check && COMPLETED_BACKGROUND_CHECK.includes(check.status),
      completedAt: check?.completedAt ?? null,
      exempt: member.backgroundCheckExempt,
      exemptReason: member.backgroundCheckExemptReason,
    },
  };
}

export type MemberNativeState = Awaited<ReturnType<typeof getMemberNativeState>>;

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
