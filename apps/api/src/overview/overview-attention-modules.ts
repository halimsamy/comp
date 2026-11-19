import { slaStatus } from '../assets/vulnerability-sla';
import { ratingLevel } from '../risks/risk-level';
import { isAcceptanceRequired } from '../risks/risk-methodology-settings';
import type { OverviewData } from './overview-data';
import { DAY_MS } from './overview-utils';
import {
  card,
  INVENTORY_REVIEW_DAYS,
  QUESTIONNAIRE_STALE_DAYS,
  reasons,
  type AttentionCard,
} from './overview-attention-types';

type Risk = OverviewData['risks'][number];

/** ISO 27001 6.1.3 f): residual risk at or above the methodology threshold needs a current owner acceptance. */
export function needsAcceptance({
  risk,
  threshold,
}: {
  risk: Risk;
  threshold: OverviewData['acceptanceThreshold'];
}): boolean {
  const level = ratingLevel(risk.residualLikelihood, risk.residualImpact);
  if (!isAcceptanceRequired({ level, threshold })) return false;
  const latest = risk.latestAcceptance;
  return (
    !latest ||
    latest.residualLikelihood !== risk.residualLikelihood ||
    latest.residualImpact !== risk.residualImpact
  );
}

/** Risks, assets, vulnerabilities, corrective actions, documents (ISMS and company forms) and questionnaire reviews (#11, #120, #148, #161). */
export function buildModuleCards({
  data,
  now,
}: {
  data: OverviewData;
  now: Date;
}): AttentionCard[] {
  const t = now.getTime();
  const isPast = (date: Date | null) => !!date && date.getTime() < t;

  // Risks
  const overdueActions = data.riskActions.filter((a) => isPast(a.dueDate));
  const unowned = data.risks.filter((r) => !r.assigneeId);
  const awaitingAcceptance = data.risks.filter((risk) =>
    needsAcceptance({ risk, threshold: data.acceptanceThreshold }),
  );
  const flaggedRisks = new Set([
    ...overdueActions.map((a) => a.entityId),
    ...unowned.map((r) => r.id),
    ...awaitingAcceptance.map((r) => r.id),
  ]);
  const hasRisks = data.risks.length > 0;
  const registerNeverReviewed = hasRisks && !data.riskRegisterReviewDue ? 1 : 0;
  const registerOverdue = hasRisks && isPast(data.riskRegisterReviewDue) ? 1 : 0;

  // Assets
  const reviewCutoff = t - INVENTORY_REVIEW_DAYS * DAY_MS;
  const noOwner = data.assets.filter((a) => !a.ownerId).length;
  const scopeUnassessed = data.assets.filter(
    (a) => a.cdeScope === 'unassessed',
  ).length;
  const notReviewed = data.assets.filter(
    (a) => !a.lastReviewedAt || a.lastReviewedAt.getTime() < reviewCutoff,
  ).length;
  const flaggedAssets = data.assets.filter(
    (a) =>
      !a.ownerId ||
      a.cdeScope === 'unassessed' ||
      !a.lastReviewedAt ||
      a.lastReviewedAt.getTime() < reviewCutoff,
  ).length;

  // Vulnerabilities (open only), plus the quarterly ASV scan (PCI DSS 11.3.2)
  const sla = data.vulnerabilities.map((v) => ({
    critical: v.severity === 'critical',
    status: slaStatus({ status: v.status, slaDueAt: v.slaDueAt, now }),
  }));
  const vulnOverdue = sla.filter((v) => v.status === 'overdue').length;
  const vulnDueSoon = sla.filter((v) => v.status === 'due_soon').length;
  const critical = sla.filter((v) => v.critical).length;
  const flaggedVulns = sla.filter(
    (v) => v.critical || v.status === 'overdue' || v.status === 'due_soon',
  ).length;
  const asv = data.scanCadence.find((c) => c.kind === 'external_asv');
  const noPassingAsv =
    (data.hasPciDss || data.hasScans) && asv?.overdue ? 1 : 0;

  // Corrective actions: the 10.2 register (standalone NCs, internal-audit NCs, auditor findings)
  const ncOverdue = data.nonconformities.filter((nc) => isPast(nc.dueDate));
  const ncCount = (status: string) =>
    data.nonconformities.filter(
      (nc) => nc.status === status && !isPast(nc.dueDate),
    ).length;

  // ISMS documents
  const docsWaiting = data.ismsDocuments.filter(
    (d) => d.status === 'needs_review',
  ).length;
  const docsNeverApproved = data.ismsDocuments.filter(
    (d) => !d.currentVersionId && d.status !== 'needs_review',
  ).length;
  // Company forms (Documents): overdue, or required and never submitted
  const formsOverdue = data.forms.filter((f) => f.status === 'overdue').length;
  const formsMissing = data.forms.filter(
    (f) => f.status === 'never_submitted' && !f.optional,
  ).length;
  const requiredForms = data.forms.filter(
    (f) => !f.optional || f.status !== 'never_submitted',
  ).length;

  // Trust-portal questionnaires waiting for an approver before answers go out
  const staleQuestionnaires = data.questionnaires.filter(
    (q) => t - q.createdAt.getTime() > QUESTIONNAIRE_STALE_DAYS * DAY_MS,
  ).length;

  return [
    card({
      module: 'risks',
      label: 'Risks',
      total: data.risks.length,
      needsAttention: flaggedRisks.size + registerOverdue + registerNeverReviewed,
      ok: data.risks.length - flaggedRisks.size,
      href: '/risk',
      reasons: reasons([
        ['Treatment actions overdue', overdueActions.length],
        ['Register review overdue', registerOverdue],
        ['Register never reviewed', registerNeverReviewed],
        ['Residual risk awaiting acceptance', awaitingAcceptance.length],
        ['No owner', unowned.length],
      ]),
    }),
    card({
      module: 'assets',
      label: 'Assets',
      total: data.assets.length,
      needsAttention: flaggedAssets,
      href: '/assets',
      reasons: reasons([
        ['No owner', noOwner],
        ['Scope not assessed', scopeUnassessed],
        ['Not reviewed in 12 months', notReviewed],
      ]),
    }),
    card({
      module: 'vulnerabilities',
      label: 'Vulnerabilities',
      total: data.vulnerabilities.length,
      needsAttention: flaggedVulns + noPassingAsv,
      ok: data.vulnerabilities.length - flaggedVulns,
      href: '/vulnerabilities',
      reasons: reasons([
        ['Past remediation SLA', vulnOverdue],
        ['Due within 14 days', vulnDueSoon],
        ['Critical', critical],
        ['No passing ASV scan this quarter', noPassingAsv],
      ]),
    }),
    card({
      module: 'correctiveActions',
      label: 'Corrective actions',
      total: data.nonconformitiesTotal,
      needsAttention: data.nonconformities.length,
      href: '/documents/isms/nonconformities',
      reasons: reasons([
        ['Overdue', ncOverdue.length],
        ['Open', ncCount('open')],
        ['In progress', ncCount('in_progress')],
      ]),
    }),
    card({
      module: 'documents',
      label: 'Documents',
      total: data.ismsDocuments.length + requiredForms,
      needsAttention: docsWaiting + docsNeverApproved + formsOverdue + formsMissing,
      href: '/documents',
      reasons: reasons([
        ['Forms overdue', formsOverdue, '/documents'],
        ['Forms never submitted', formsMissing, '/documents'],
        ['ISMS documents waiting for approval', docsWaiting, '/documents/isms'],
        ['ISMS documents never approved', docsNeverApproved, '/documents/isms'],
      ]),
    }),
    card({
      module: 'questionnaires',
      label: 'Questionnaire reviews',
      total: data.questionnaires.length,
      needsAttention: data.questionnaires.length,
      href: '/questionnaire',
      reasons: reasons([
        [`Waiting over ${QUESTIONNAIRE_STALE_DAYS} days`, staleQuestionnaires],
        [
          'Waiting for review',
          data.questionnaires.length - staleQuestionnaires,
        ],
      ]),
    }),
  ];
}
