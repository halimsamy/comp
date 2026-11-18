import type { IsmsDocumentType } from '@db';

/** One "what's missing" item on the guided ISMS overview. */
export interface ReadinessCheck {
  label: string;
  done: boolean;
}

export interface DocumentReadiness {
  type: IsmsDocumentType;
  documentId: string;
  status: string;
  checks: ReadinessCheck[];
  percent: number;
  missing: string[];
}

/** Everything the per-clause checks read, already loaded and org-scoped. */
export interface ReadinessFacts {
  status: string;
  hasNarrative: boolean;
  internalIssues: number;
  externalIssues: number;
  parties: number;
  requirements: Array<{ ownerMemberId: string | null; lastReviewedAt: Date | null }>;
  objectives: Array<{ ownerMemberId: string | null; target: string | null }>;
  roleMessages: string[];
  unacknowledgedAssignments: number;
  metricMessages: string[];
  overdueMetrics: number;
  riskTreatmentMessages: string[];
  completedAuditDates: Date[];
  auditMessages: string[];
  completedReviewDates: Date[];
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function withinYear(dates: Date[], now: Date): boolean {
  return dates.some((date) => now.getTime() - date.getTime() <= YEAR_MS);
}

function check(label: string, done: boolean): ReadinessCheck {
  return { label, done };
}

/** Validator messages as failing items, or one passing item when clean. */
function messageChecks(messages: string[], okLabel: string): ReadinessCheck[] {
  return messages.length > 0
    ? messages.map((message) => check(message, false))
    : [check(okLabel, true)];
}

function typeChecks({
  type,
  facts,
  now,
}: {
  type: IsmsDocumentType;
  facts: ReadinessFacts;
  now: Date;
}): ReadinessCheck[] {
  switch (type) {
    case 'context_of_organization':
      return [
        check('Record at least one internal issue', facts.internalIssues > 0),
        check('Record at least one external issue', facts.externalIssues > 0),
      ];
    case 'interested_parties_register':
      return [check('List your interested parties', facts.parties > 0)];
    case 'interested_parties_requirements': {
      const rows = facts.requirements;
      return [
        check('Record the requirements of interested parties', rows.length > 0),
        check(
          'Give every requirement an owner',
          rows.length > 0 && rows.every((row) => row.ownerMemberId),
        ),
        check(
          'Review every requirement in the last 12 months',
          rows.length > 0 &&
            rows.every(
              (row) => row.lastReviewedAt && withinYear([row.lastReviewedAt], now),
            ),
        ),
      ];
    }
    case 'isms_scope':
      return [check('Draft the scope statement', facts.hasNarrative)];
    case 'leadership_commitment':
      return [check('Draft the leadership commitment', facts.hasNarrative)];
    case 'risk_assessment_methodology':
      return [check('Draft the risk assessment methodology', facts.hasNarrative)];
    case 'roles_and_responsibilities':
      return [
        ...messageChecks(facts.roleMessages, 'Assign every governance role'),
        check(
          'Every role holder has acknowledged their role',
          facts.unacknowledgedAssignments === 0,
        ),
      ];
    case 'risk_treatment_plan':
      return messageChecks(
        facts.riskTreatmentMessages,
        'Risk register ready for the treatment plan',
      );
    case 'objectives_plan':
      return [
        check('Set at least one security objective', facts.objectives.length > 0),
        check(
          'Give every objective an owner and a target',
          facts.objectives.length > 0 &&
            facts.objectives.every((row) => row.ownerMemberId && row.target?.trim()),
        ),
      ];
    case 'monitoring':
      return [
        ...messageChecks(facts.metricMessages, 'Define active metrics with a cadence'),
        check('Record every metric for its latest period', facts.overdueMetrics === 0),
      ];
    case 'internal_audit':
      return [
        ...messageChecks(facts.auditMessages, 'Record audits with their conclusions'),
        check(
          'Complete an internal audit in the last 12 months',
          withinYear(facts.completedAuditDates, now),
        ),
      ];
    case 'management_review':
      return [
        check(
          'Hold a management review in the last 12 months',
          withinYear(facts.completedReviewDates, now),
        ),
      ];
    default:
      return [];
  }
}

/** Per-clause checklist: type-specific items, then approval. */
export function buildDocumentReadiness({
  type,
  documentId,
  facts,
  now,
}: {
  type: IsmsDocumentType;
  documentId: string;
  facts: ReadinessFacts;
  now: Date;
}): DocumentReadiness {
  const checks = [
    ...typeChecks({ type, facts, now }),
    check('Approve and publish the document', facts.status === 'approved'),
  ];
  const done = checks.filter((item) => item.done).length;
  return {
    type,
    documentId,
    status: facts.status,
    checks,
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter((item) => !item.done).map((item) => item.label),
  };
}
