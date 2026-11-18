import { db } from '@db';
import { GENERAL_TRAINING_VIDEO_IDS } from '@trycompai/company';
import { filterComplianceMembers } from '../../utils/compliance-filters';
import {
  findingAgeing,
  policyAcknowledgement,
  riskTreatmentStatus,
  taskOnTimeRate,
  trainingCompletion,
  vendorReviewCurrency,
  type ComputedMetricValue,
} from './metric-compute';

/** Seeded metric keys Comp AI measures from its own data. */
export const COMPUTED_METRIC_KEYS = [
  'training_completion',
  'policy_acknowledgement',
  'finding_ageing',
  'risk_treatment_status',
  'vendor_review_currency',
  'task_on_time',
] as const;

export type ComputedMetricKey = (typeof COMPUTED_METRIC_KEYS)[number];

export function isComputedMetricKey(key: string | null): key is ComputedMetricKey {
  return COMPUTED_METRIC_KEYS.some((computed) => computed === key);
}

/** Current value of every computable 9.1 metric for one organization. */
export async function computePlatformMetrics({
  organizationId,
  now = new Date(),
}: {
  organizationId: string;
  now?: Date;
}): Promise<Record<ComputedMetricKey, ComputedMetricValue>> {
  const [members, policies, findings, nonconformities, risks, vendors, tasks] =
    await Promise.all([
      db.member.findMany({
        where: { organizationId, deactivated: false },
        select: { id: true, role: true, user: { select: { role: true } } },
      }),
      db.policy.findMany({
        where: {
          organizationId,
          isRequiredToSign: true,
          status: 'published',
          isArchived: false,
          archivedAt: null,
        },
        select: { signedBy: true },
      }),
      db.ismsAuditFinding.findMany({
        where: {
          status: { not: 'closed' },
          audit: { document: { organizationId } },
        },
        select: { createdAt: true, dueDate: true },
      }),
      db.ismsNonconformity.findMany({
        where: { organizationId, status: { not: 'closed' } },
        select: { createdAt: true, dueDate: true },
      }),
      db.risk.findMany({
        where: { organizationId },
        select: {
          status: true,
          treatmentStrategyDescription: true,
          residualLikelihood: true,
          residualImpact: true,
        },
      }),
      db.vendor.findMany({
        where: { organizationId },
        select: {
          criticality: true,
          lastReviewedAt: true,
          nextReviewDue: true,
          documents: { where: { type: 'dpa' }, select: { id: true }, take: 1 },
        },
      }),
      db.task.findMany({
        where: {
          organizationId,
          frequency: { not: null },
          status: { not: 'not_relevant' },
        },
        select: { reviewDate: true },
      }),
    ]);

  const inScope = await filterComplianceMembers(members, organizationId);
  const memberIds = inScope.map((member) => member.id);
  const completions = await db.employeeTrainingVideoCompletion.findMany({
    where: { memberId: { in: memberIds }, completedAt: { not: null } },
    select: { memberId: true, videoId: true },
  });
  const completedVideoIdsByMember = new Map<string, Set<string>>();
  for (const completion of completions) {
    const set = completedVideoIdsByMember.get(completion.memberId) ?? new Set();
    set.add(completion.videoId);
    completedVideoIdsByMember.set(completion.memberId, set);
  }

  return {
    training_completion: trainingCompletion({
      memberIds,
      completedVideoIdsByMember,
      requiredVideoIds: GENERAL_TRAINING_VIDEO_IDS,
    }),
    policy_acknowledgement: policyAcknowledgement({
      memberIds,
      requiredPolicies: policies,
    }),
    finding_ageing: findingAgeing({
      openItems: [...findings, ...nonconformities],
      now,
    }),
    risk_treatment_status: riskTreatmentStatus({ risks }),
    vendor_review_currency: vendorReviewCurrency({
      vendors: vendors.map(({ documents, ...vendor }) => ({
        ...vendor,
        hasDpa: documents.length > 0,
      })),
      now,
    }),
    task_on_time: taskOnTimeRate({ tasks, now }),
  };
}
