import { db } from '@db';
import { scanCadence } from '../assets/vulnerability-scans';
import { listFormDeadlines } from '../evidence-forms/form-deadlines';
import { IsmsNonconformityService } from '../isms/isms-nonconformity.service';
import { buildOrgCompliance } from '../people-lifecycle/org-compliance';
import { trainingStatusForOrg } from '../people-lifecycle/training-status';
import { loadRiskMethodologySettings } from '../risks/load-risk-methodology-settings';
import { listOverduePhases } from '../timelines/timeline-progress';

const memberName = {
  select: { user: { select: { name: true, email: true } } },
};

/**
 * The newer modules the overview monitors (#120, #148, #161): people and
 * training (people-access rules), risks, assets, vulnerabilities and scans,
 * the 10.2 corrective-action register, ISMS documents, questionnaire reviews,
 * audit requests, timeline phases and company form deadlines. Every query is scoped to the org.
 */
export async function loadModuleData({
  organizationId,
  now = new Date(),
}: {
  organizationId: string;
  now?: Date;
}) {
  const [
    frameworks,
    training,
    people,
    risks,
    riskActions,
    latestRiskReview,
    acceptances,
    methodology,
    assets,
    vulnerabilities,
    scans,
    nonconformities,
    reviewActions,
    ismsDocuments,
    questionnaires,
    auditRequests,
    overduePhases,
    forms,
  ] = await Promise.all([
    db.frameworkInstance.findMany({
      where: { organizationId },
      select: {
        framework: { select: { name: true } },
        customFramework: { select: { name: true } },
      },
    }),
    trainingStatusForOrg(organizationId, now),
    buildOrgCompliance({ organizationId, now }),
    db.risk.findMany({
      where: { organizationId, status: { not: 'archived' } },
      select: {
        id: true,
        title: true,
        assigneeId: true,
        residualLikelihood: true,
        residualImpact: true,
      },
    }),
    db.taskItem.findMany({
      where: {
        organizationId,
        entityType: 'risk',
        status: { notIn: ['done', 'canceled'] },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        entityId: true,
        assignee: memberName,
      },
    }),
    db.riskReview.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { nextReviewDue: true },
    }),
    db.riskAcceptance.findMany({
      where: { organizationId, riskId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { riskId: true, residualLikelihood: true, residualImpact: true },
    }),
    loadRiskMethodologySettings({ organizationId }),
    db.asset.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, ownerId: true, cdeScope: true, lastReviewedAt: true },
    }),
    db.integrationPlatformFinding.findMany({
      where: { organizationId, status: 'open' },
      select: {
        id: true,
        title: true,
        severity: true,
        status: true,
        slaDueAt: true,
        owner: memberName,
      },
    }),
    db.vulnerabilityScan.findMany({
      where: { organizationId },
      select: { kind: true, scannedAt: true, passed: true },
    }),
    new IsmsNonconformityService().list({ organizationId }),
    db.ismsReviewAction.findMany({
      where: {
        status: { not: 'closed' },
        review: { document: { organizationId } },
      },
      select: {
        id: true,
        reference: true,
        description: true,
        dueDate: true,
        review: { select: { reference: true } },
      },
    }),
    db.ismsDocument.findMany({
      where: { organizationId },
      select: { id: true, title: true, status: true, currentVersionId: true },
    }),
    db.questionnaire.findMany({
      where: { organizationId, reviewStatus: 'pending_review' },
      select: { id: true, filename: true, createdAt: true },
    }),
    db.auditEvidenceRequest.findMany({
      where: {
        status: 'open',
        audit: { organizationId, status: { not: 'completed' } },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        auditId: true,
        audit: { select: { title: true } },
      },
    }),
    listOverduePhases(organizationId, now),
    listFormDeadlines(organizationId, now),
  ]);

  const frameworkNames = frameworks.map(
    (f) => f.framework?.name ?? f.customFramework?.name ?? '',
  );
  const latestAcceptance = new Map<string, (typeof acceptances)[number]>();
  for (const acceptance of acceptances) {
    if (acceptance.riskId && !latestAcceptance.has(acceptance.riskId))
      latestAcceptance.set(acceptance.riskId, acceptance);
  }

  return {
    hasPciDss: frameworkNames.some((n) => n.toUpperCase().startsWith('PCI')),
    training,
    people: people.map((entry) => ({
      memberId: entry.member.id,
      name: entry.member.name || entry.member.email,
      former: entry.member.former,
      overall: entry.overall,
    })),
    risks: risks.map((risk) => ({
      ...risk,
      latestAcceptance: latestAcceptance.get(risk.id) ?? null,
    })),
    // Treatment actions of archived risks no longer count.
    riskActions: riskActions.filter((a) => risks.some((r) => r.id === a.entityId)),
    riskRegisterReviewDue: latestRiskReview?.nextReviewDue ?? null,
    acceptanceThreshold: methodology.acceptanceRequiredFromLevel,
    assets,
    vulnerabilities,
    scanCadence: scanCadence({ scans, now }),
    hasScans: scans.length > 0,
    nonconformities: nonconformities.data.filter((nc) => nc.status !== 'closed'),
    nonconformitiesTotal: nonconformities.count,
    reviewActions,
    ismsDocuments,
    questionnaires,
    auditRequests,
    overduePhases,
    // Retired (hidden) and not-relevant forms are nobody's work.
    forms: forms
      .filter((f) => !f.hidden && !f.isNotRelevant)
      .map(({ formType, title, optional, status, nextDueAt, ownerMemberId }) => ({
        formType,
        title,
        optional,
        status,
        nextDueAt,
        ownerMemberId,
      })),
  };
}

export type ModuleData = Awaited<ReturnType<typeof loadModuleData>>;
