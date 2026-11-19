import { db } from '@db';
import type { Prisma } from '@db';
import { isFormerMember } from '../../people-lifecycle/checklist-progress';
import { filterComplianceMembers } from '../../utils/compliance-filters';
import { parseStoredAnswers } from '../wizard/wizard-schema';
import { fingerprintParties, fingerprintRiskTreatment } from './platform-fingerprints';
import type { IsmsPlatformData } from './types';

const CLOUD_CATEGORIES = ['cloud', 'infrastructure', 'software_as_a_service'];
const HIGH_LIKELIHOOD = ['likely', 'very_likely'];
const HIGH_IMPACT = ['major', 'severe'];

/**
 * Reads all platform data used to derive the ISMS foundational documents for a
 * single organization. Always scoped by organizationId. The returned shape is
 * the raw snapshot — derivation logic lives in the per-document handlers so this
 * file only owns the queries.
 */
export async function collectPlatformData({
  organizationId,
  frameworkId,
  client,
}: {
  organizationId: string;
  frameworkId: string;
  /**
   * Optional transaction client. The approval flow passes its transaction so
   * the drift baseline is read at the SAME point in time as the rows frozen
   * into the published version — otherwise a concurrent edit between the two
   * reads makes a just-approved document immediately show as stale.
   */
  client?: Prisma.TransactionClient;
}): Promise<IsmsPlatformData> {
  const dbc = client ?? db;
  const [
    organization,
    frameworkInstances,
    allVendors,
    members,
    deviceCount,
    risks,
    trainingCompletionCount,
    ownFramework,
    profile,
    partiesRows,
    acceptanceRows,
    deputyHolder,
  ] = await Promise.all([
    dbc.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    dbc.frameworkInstance.findMany({
      where: { organizationId },
      select: { framework: { select: { name: true } } },
    }),
    dbc.vendor.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        category: true,
        isSubProcessor: true,
        archivedAt: true,
        // Risk fields feed the Risk Treatment Plan fingerprint (6.1.3).
        status: true,
        inherentProbability: true,
        inherentImpact: true,
        residualProbability: true,
        residualImpact: true,
        treatmentStrategy: true,
        treatmentStrategyDescription: true,
        assigneeId: true,
        assignee: { select: { user: { select: { name: true, email: true } } } },
      },
    }),
    // Same population People/Training count: current members with the compliance obligation.
    dbc.member.findMany({
      where: { organizationId, deactivated: false },
      select: {
        role: true,
        department: true,
        deactivated: true,
        offboardDate: true,
        user: { select: { role: true } },
      },
    }),
    dbc.device.count({ where: { organizationId } }),
    dbc.risk.findMany({
      where: { organizationId },
      select: {
        id: true,
        residualLikelihood: true,
        residualImpact: true,
        // The remaining fields feed the Risk Treatment Plan fingerprint (6.1.3).
        title: true,
        category: true,
        status: true,
        likelihood: true,
        impact: true,
        treatmentStrategy: true,
        treatmentStrategyDescription: true,
        assigneeId: true,
        assignee: { select: { user: { select: { name: true, email: true } } } },
      },
    }),
    dbc.employeeTrainingVideoCompletion.count({
      where: { member: { organizationId } },
    }),
    dbc.frameworkEditorFramework.findUnique({
      where: { id: frameworkId },
      select: { name: true },
    }),
    dbc.ismsProfile.findUnique({
      where: { organizationId_frameworkId: { organizationId, frameworkId } },
      select: { answers: true },
    }),
    dbc.ismsInterestedParty.findMany({
      where: {
        document: {
          organizationId,
          frameworkId,
          type: 'interested_parties_register',
        },
      },
      select: { id: true, name: true, category: true },
    }),
    dbc.riskAcceptance.findMany({
      where: { organizationId },
      select: { id: true, riskId: true, vendorId: true },
    }),
    // 5.3 Roles holds the Deputy SPO; the wizard answer is only a legacy fallback.
    dbc.ismsRoleAssignment.findFirst({
      where: {
        role: {
          roleKey: 'deputy_spo',
          document: { organizationId, frameworkId, type: 'roles_and_responsibilities' },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { memberId: true },
    }),
  ]);

  const frameworkNames = new Set<string>();
  for (const instance of frameworkInstances) {
    if (instance.framework?.name) frameworkNames.add(instance.framework.name);
  }
  if (ownFramework?.name) frameworkNames.add(ownFramework.name);

  const vendorsByCategory: Record<string, number> = {};
  const subProcessorNames: string[] = [];
  const infraVendorNames: string[] = [];
  // Vendors register and Overview count non-archived vendors only.
  const vendors = allVendors.filter((vendor) => !vendor.archivedAt);
  for (const vendor of vendors) {
    vendorsByCategory[vendor.category] =
      (vendorsByCategory[vendor.category] ?? 0) + 1;
    if (vendor.isSubProcessor) subProcessorNames.push(vendor.name);
    if (CLOUD_CATEGORIES.includes(vendor.category)) {
      infraVendorNames.push(vendor.name);
    }
  }

  const now = new Date();
  const currentMembers = await filterComplianceMembers(
    members.filter((member) => !isFormerMember(member, now)),
    organizationId,
  );
  const membersByDepartment: Record<string, number> = {};
  for (const { department } of currentMembers) {
    membersByDepartment[department] = (membersByDepartment[department] ?? 0) + 1;
  }
  const wizardAnswers = parseStoredAnswers(profile?.answers);
  if (deputyHolder) wizardAnswers.deputySpo = { memberId: deputyHolder.memberId };

  const highRiskCount = risks.filter(
    (risk) =>
      HIGH_LIKELIHOOD.includes(risk.residualLikelihood) &&
      HIGH_IMPACT.includes(risk.residualImpact),
  ).length;

  return {
    organizationName: organization?.name?.trim() || 'The organization',
    frameworkNames: Array.from(frameworkNames).sort(),
    vendorCount: vendors.length,
    subProcessorCount: subProcessorNames.length,
    vendorsByCategory,
    subProcessorNames: subProcessorNames.sort(),
    infraVendorNames: infraVendorNames.sort(),
    memberCount: currentMembers.length,
    membersByDepartment,
    deviceCount,
    riskCount: risks.length,
    highRiskCount,
    hasTrainingProgram: trainingCompletionCount > 0,
    wizardAnswers,
    partiesFingerprint: fingerprintParties(partiesRows),
    riskTreatmentFingerprint: fingerprintRiskTreatment({
      risks,
      // The 6.1.3 plan renders archived vendors too, so its fingerprint keeps them.
      vendors: allVendors,
      acceptances: acceptanceRows,
    }),
  };
}
