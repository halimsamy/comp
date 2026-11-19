import type { OverviewData } from './overview-data';
import { DAY_MS, personName } from './overview-utils';

export type ModuleDeadlineType =
  | 'policy_approval'
  | 'timeline_phase'
  | 'audit_request'
  | 'questionnaire_review'
  | 'vulnerability'
  | 'corrective_action'
  | 'review_action'
  | 'risk_review'
  | 'risk_action'
  | 'scan'
  | 'form';

export interface RawDeadline<T extends string = string> {
  id: string;
  type: T;
  title: string;
  subtitle: string | null;
  /** null = open work with no due date (the "No due date" tab). */
  due: Date | null;
  href: string;
  ownerName: string | null;
}

/** A policy approval is expected within this many days of submission. */
export const POLICY_APPROVAL_DUE_DAYS = 30;
/** Trust-portal questionnaire answers are reviewed within this many business days. */
export const QUESTIONNAIRE_REVIEW_BUSINESS_DAYS = 5;

const SCAN_LABEL = {
  external_asv: { title: 'Quarterly ASV scan', ref: 'PCI DSS 11.3.2' },
  internal: { title: 'Quarterly internal vulnerability scan', ref: 'PCI DSS 11.3.1' },
  pentest: { title: 'Annual penetration test', ref: 'PCI DSS 11.4' },
} as const;

/** Adds working days (Mon–Fri, UTC), skipping weekends. */
export function addBusinessDays({ date, days }: { date: Date; days: number }): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

/** Deadlines from the newer modules (#4, #120, #136): approvals, audits, ISMS, risks, vulnerabilities, scans and company forms. */
export function moduleDeadlines(
  data: OverviewData,
): Array<RawDeadline<ModuleDeadlineType>> {
  const items: Array<RawDeadline<ModuleDeadlineType>> = [];

  for (const policy of data.policies) {
    if (!policy.submittedForApprovalAt) continue;
    items.push({
      id: policy.id,
      type: 'policy_approval',
      title: policy.name,
      subtitle: 'Policy approval',
      due: new Date(
        policy.submittedForApprovalAt.getTime() + POLICY_APPROVAL_DUE_DAYS * DAY_MS,
      ),
      href: `/policies/${policy.id}`,
      ownerName: personName(policy.assignee),
    });
  }

  for (const phase of data.overduePhases) {
    items.push({
      id: phase.phaseId,
      type: 'timeline_phase',
      title: `${phase.frameworkName}: ${phase.phaseName}`,
      subtitle: 'Timeline phase',
      due: phase.dueDate,
      href: `/frameworks/${phase.frameworkInstanceId}`,
      ownerName: null,
    });
  }

  for (const request of data.auditRequests) {
    items.push({
      id: request.id,
      type: 'audit_request',
      title: request.title,
      subtitle: `Auditor request · ${request.audit.title}`,
      due: request.dueDate,
      href: `/audits/${request.auditId}`,
      ownerName: null,
    });
  }

  for (const questionnaire of data.questionnaires) {
    items.push({
      id: questionnaire.id,
      type: 'questionnaire_review',
      title: questionnaire.filename,
      subtitle: 'Questionnaire answers to review',
      due: addBusinessDays({
        date: questionnaire.createdAt,
        days: QUESTIONNAIRE_REVIEW_BUSINESS_DAYS,
      }),
      href: `/questionnaire/${questionnaire.id}`,
      ownerName: null,
    });
  }

  for (const vulnerability of data.vulnerabilities) {
    if (!vulnerability.slaDueAt) continue; // info findings carry no SLA
    items.push({
      id: vulnerability.id,
      type: 'vulnerability',
      title: vulnerability.title,
      subtitle: `Vulnerability remediation · ${vulnerability.severity}`,
      due: vulnerability.slaDueAt,
      href: `/vulnerabilities?id=${vulnerability.id}`,
      ownerName: personName(vulnerability.owner),
    });
  }

  for (const nc of data.nonconformities) {
    items.push({
      id: nc.id,
      type: 'corrective_action',
      title: `${nc.reference}: ${nc.description}`,
      subtitle: 'Corrective action',
      due: nc.dueDate,
      href: '/documents/isms/nonconformities',
      ownerName: null,
    });
  }

  for (const action of data.reviewActions) {
    items.push({
      id: action.id,
      type: 'review_action',
      title: `${action.review.reference}-${action.reference}: ${action.description}`,
      subtitle: 'Management review action',
      due: action.dueDate,
      href: '/documents/isms/management-review',
      ownerName: null,
    });
  }

  for (const action of data.riskActions) {
    items.push({
      id: action.id,
      type: 'risk_action',
      title: action.title,
      subtitle: 'Risk treatment action',
      due: action.dueDate,
      href: `/risk/${action.entityId}`,
      ownerName: personName(action.assignee),
    });
  }

  if (data.risks.length > 0) {
    items.push({
      id: 'risk-register-review',
      type: 'risk_review',
      title: 'Risk register review',
      subtitle: 'ISO 27001 8.2 · PCI DSS 12.3.1',
      due: data.riskRegisterReviewDue,
      href: '/risk',
      ownerName: null,
    });
  }

  // Company forms: next due date from the cadence; required forms never submitted have none.
  for (const form of data.forms) {
    if (!form.nextDueAt && form.optional) continue;
    items.push({
      id: form.formType,
      type: 'form',
      title: form.title,
      subtitle: form.nextDueAt ? 'Company form' : 'Company form · never submitted',
      due: form.nextDueAt,
      href: `/documents/${form.formType}`,
      ownerName: form.ownerName,
    });
  }

  // The scan cadence matters for PCI DSS orgs, or once scans are recorded.
  if (data.hasPciDss || data.hasScans) {
    for (const cadence of data.scanCadence) {
      if (cadence.kind === 'pentest') continue;
      const label = SCAN_LABEL[cadence.kind];
      items.push({
        id: `scan:${cadence.kind}`,
        type: 'scan',
        title: label.title,
        subtitle: cadence.lastScanAt
          ? `${label.ref} · next one due`
          : `${label.ref} · none recorded yet`,
        due: cadence.nextDueAt,
        href: '/vulnerabilities',
        ownerName: null,
      });
    }
  }

  return items;
}
