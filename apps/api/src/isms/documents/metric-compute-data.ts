import { db } from '@db';
import { filterComplianceMembers } from '../../utils/compliance-filters';
import { trainingStatusForOrg } from '../../people-lifecycle/training-status';
import { policyAckCoverage } from '../../overview/policy-ack-coverage';
import {
  isVendorInReviewScope,
  reviewStatus,
} from '../../vendors/tpsp/vendor-review-status';
import { IsmsNonconformityService } from '../isms-nonconformity.service';
import { loadSlaDays, slaDueDate } from '../../assets/vulnerability-sla';
import {
  findingAgeing,
  policyAcknowledgement,
  riskTreatmentStatus,
  taskOnTimeRate,
  trainingCompletion,
  vendorReviewCurrency,
  vulnerabilityRemediationWithinSla,
  type ComputedMetricKey,
  type ComputedMetricValue,
} from './metric-compute';

export { COMPUTED_METRIC_KEYS, isComputedMetricKey } from './metric-compute';
export type { ComputedMetricKey } from './metric-compute';

/** Current value of every computable 9.1 metric for one organization. */
export async function computePlatformMetrics({
  organizationId,
  now = new Date(),
}: {
  organizationId: string;
  now?: Date;
}): Promise<Record<ComputedMetricKey, ComputedMetricValue>> {
  // Each metric reuses the rule of the module that owns the data, so the 9.1
  // value never disagrees with People, the Overview, Vendors or the 10.2 register.
  const [
    members,
    policies,
    register,
    training,
    risks,
    vendors,
    tasks,
    vulnerabilities,
    slaDays,
  ] = await Promise.all([
      // Same member set as the Overview acknowledgements card.
      db.member.findMany({
        where: { organizationId, isActive: true, deactivated: false },
        select: { id: true, role: true, department: true, user: { select: { role: true } } },
      }),
      db.policy.findMany({
        where: {
          organizationId,
          isRequiredToSign: true,
          status: 'published',
          isArchived: false,
          archivedAt: null,
        },
        select: {
          id: true,
          status: true,
          isRequiredToSign: true,
          signedBy: true,
          visibility: true,
          visibleToDepartments: true,
        },
      }),
      new IsmsNonconformityService().list({ organizationId }),
      trainingStatusForOrg(organizationId, now),
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
        where: { organizationId, archivedAt: null },
        select: {
          criticality: true,
          handlesCardholderData: true,
          affectsCdeSecurity: true,
          inherentProbability: true,
          inherentImpact: true,
          lastReviewedAt: true,
          nextReviewDue: true,
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
      db.integrationPlatformFinding.findMany({
        where: {
          organizationId,
          severity: { in: ['critical', 'high'] },
          status: { in: ['open', 'resolved'] },
        },
        select: { severity: true, firstSeenAt: true, slaDueAt: true, resolvedAt: true },
      }),
      loadSlaDays(organizationId),
    ]);

  const inScope = await filterComplianceMembers(members, organizationId);

  return {
    training_completion: trainingCompletion({ members: training.members }),
    policy_acknowledgement: policyAcknowledgement({
      coverage: policyAckCoverage({ policies, members: inScope }),
    }),
    finding_ageing: findingAgeing({
      openItems: register.data.filter((row) => row.status !== 'closed'),
      now,
    }),
    risk_treatment_status: riskTreatmentStatus({ risks }),
    vendor_review_currency: vendorReviewCurrency({
      statuses: vendors
        .filter((vendor) => isVendorInReviewScope(vendor))
        .map((vendor) => reviewStatus({ ...vendor, now })),
    }),
    task_on_time: taskOnTimeRate({ tasks, now }),
    vulnerability_remediation: vulnerabilityRemediationWithinSla({
      // Rows from before the SLA snapshot existed get their due date from the policy.
      vulnerabilities: vulnerabilities.map((row) => ({
        resolvedAt: row.resolvedAt,
        slaDueAt:
          row.slaDueAt ??
          slaDueDate({ severity: row.severity, firstSeenAt: row.firstSeenAt, days: slaDays }),
      })),
      now,
    }),
  };
}
