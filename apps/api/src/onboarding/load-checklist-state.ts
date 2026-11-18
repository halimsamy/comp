import { db } from '@db';
import { z } from 'zod';
import type { ChecklistSkips, ChecklistState } from './checklist-types';

const ISO_27001_NAMES = ['ISO 27001', 'iso27001', 'ISO27001'];
const LEGACY_CLOUD_INTEGRATIONS = ['aws', 'gcp', 'azure'];
/** Catalog task "Scope confirmation & CDE inventory pack" (PCI DSS 12.5.2 / 12.5.2.1). */
export const PCI_SCOPE_TASK_TEMPLATE_ID = 'frk_tt_69dd3f6094fc732d635210ae';

const skipsSchema = z.record(
  z.string(),
  z.object({
    reason: z.string(),
    skippedAt: z.string(),
    skippedById: z.string().nullable(),
  }),
);

export function parseSkips(raw: unknown): ChecklistSkips {
  const parsed = skipsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

const hasRole = (roleString: string, role: string) =>
  roleString
    .split(',')
    .map((r) => r.trim())
    .includes(role);

/** Reads everything the Getting Started guide needs, scoped to one organization. */
export async function loadChecklistState(
  organizationId: string,
): Promise<ChecklistState> {
  const where = { organizationId };
  const [
    org,
    frameworks,
    ismsProfile,
    connections,
    legacyCloud,
    deviceCount,
    policies,
    members,
    pendingAuditorInvites,
    ismsDocuments,
    soa,
    pciScopeTask,
    risks,
    acceptances,
    vendors,
    taskGroups,
    evidenceSubmissions,
    onboarding,
  ] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { logo: true, website: true, fleetDmLabelId: true },
    }),
    db.frameworkInstance.findMany({
      where,
      select: {
        framework: { select: { name: true } },
        customFramework: { select: { name: true } },
      },
    }),
    db.ismsProfile.findFirst({
      where: { organizationId, completedAt: { not: null } },
      select: { id: true },
    }),
    db.integrationConnection.findMany({
      where: { organizationId, status: 'active' },
      select: { provider: { select: { category: true } } },
    }),
    db.integration.count({
      where: {
        organizationId,
        integrationId: { in: LEGACY_CLOUD_INTEGRATIONS },
      },
    }),
    db.device.count({ where }),
    db.policy.findMany({
      where: { organizationId, isArchived: false, archivedAt: null },
      select: {
        id: true,
        status: true,
        isRequiredToSign: true,
        visibility: true,
        signedBy: true,
      },
      orderBy: { name: 'asc' },
    }),
    db.member.findMany({
      where: { organizationId, deactivated: false },
      select: { id: true, role: true },
    }),
    db.invitation.count({
      where: {
        organizationId,
        status: 'pending',
        role: { contains: 'auditor' },
      },
    }),
    db.ismsDocument.findMany({ where, select: { currentVersionId: true } }),
    db.sOADocument.findFirst({
      where: { organizationId, isLatest: true, status: 'completed' },
      select: { id: true },
    }),
    db.task.findFirst({
      where: { organizationId, taskTemplateId: PCI_SCOPE_TASK_TEMPLATE_ID },
      select: { id: true, status: true },
    }),
    db.risk.findMany({
      where: { organizationId, status: { not: 'archived' } },
      select: { id: true, status: true },
    }),
    db.riskAcceptance.findMany({
      where: { organizationId, riskId: { not: null } },
      select: { riskId: true },
      distinct: ['riskId'],
    }),
    db.vendor.findMany({ where, select: { status: true } }),
    db.task.groupBy({ by: ['status'], where, _count: { _all: true } }),
    db.evidenceSubmission.count({ where }),
    db.onboarding.findUnique({
      where: { organizationId },
      select: { checklistSkips: true },
    }),
  ]);

  const frameworkNames = frameworks.map(
    (fi) => fi.framework?.name ?? fi.customFramework?.name ?? '',
  );
  const published = policies.filter((p) => p.status === 'published');
  // shortcut: department-scoped policies are left out of the acknowledgement count; add per-department matching if orgs rely on them.
  const mustSign = published.filter(
    (p) => p.isRequiredToSign && p.visibility === 'ALL',
  );
  const signers = members.filter(
    (m) => hasRole(m.role, 'employee') || hasRole(m.role, 'contractor'),
  );
  const acceptedRiskIds = new Set(acceptances.map((a) => a.riskId));
  const taskCount = (statuses: string[]) =>
    taskGroups
      .filter((g) => statuses.includes(g.status))
      .reduce((sum, g) => sum + g._count._all, 0);

  return {
    hasIso27001: frameworkNames.some((name) => ISO_27001_NAMES.includes(name)),
    hasPciDss: frameworkNames.some((name) =>
      name.toUpperCase().startsWith('PCI'),
    ),
    frameworkCount: frameworks.length,
    hasLogo: Boolean(org?.logo),
    hasWebsite: Boolean(org?.website),
    ismsProfileCompleted: Boolean(ismsProfile),
    connectedCategories: [
      ...new Set(connections.map((c) => c.provider.category)),
    ],
    hasLegacyCloudIntegration: legacyCloud > 0,
    hasDeviceSource: deviceCount > 0 || org?.fleetDmLabelId != null,
    policies: {
      total: policies.length,
      published: published.length,
      firstUnpublishedId:
        policies.find((p) => p.status !== 'published')?.id ?? null,
    },
    acknowledgements: {
      members: mustSign.length > 0 ? signers.length : 0,
      fullySigned:
        mustSign.length > 0
          ? signers.filter((m) =>
              mustSign.every((p) => p.signedBy.includes(m.id)),
            ).length
          : 0,
    },
    ismsDocuments: {
      total: ismsDocuments.length,
      approved: ismsDocuments.filter((d) => d.currentVersionId).length,
    },
    soaApproved: Boolean(soa),
    pciScopeTask: pciScopeTask
      ? { id: pciScopeTask.id, done: pciScopeTask.status === 'done' }
      : null,
    activeMembers: members.length,
    risks: {
      total: risks.length,
      assessed: risks.filter((r) => r.status !== 'open').length,
      withAcceptance: risks.filter((r) => acceptedRiskIds.has(r.id)).length,
    },
    vendors: {
      total: vendors.length,
      assessed: vendors.filter((v) => v.status === 'assessed').length,
    },
    tasks: {
      total: taskCount([
        'todo',
        'in_progress',
        'in_review',
        'done',
        'not_relevant',
        'failed',
      ]),
      complete: taskCount(['done', 'not_relevant']),
    },
    evidenceSubmissions,
    auditorInvited:
      pendingAuditorInvites > 0 ||
      members.some((m) => hasRole(m.role, 'auditor')),
    skips: parseSkips(onboarding?.checklistSkips),
  };
}
