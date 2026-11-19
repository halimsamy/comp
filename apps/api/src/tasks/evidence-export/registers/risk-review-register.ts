import { db, type Prisma } from '@db';
import { LEVEL_LABEL, type RiskLevel } from '../../../risks/risk-level';
import type { RiskReviewSnapshot } from '../../../risks/risk-review-snapshot';
import { isActionOverdue } from '../../../risks/risk-workspace.service';
import { humanize, personName, toCsv, type RegisterParams } from './register-csv';

type SnapshotRisk = RiskReviewSnapshot['risks'][number];

const level = (value: string) => LEVEL_LABEL[value as RiskLevel] ?? humanize(value);

/** The stored snapshot's risks and totals; malformed rows read as empty. */
export function snapshotOf(snapshot: Prisma.JsonValue): {
  risks: SnapshotRisk[];
  totals: Partial<RiskReviewSnapshot['totals']>;
  acceptanceRequiredFromLevel: string | null;
} {
  const record =
    typeof snapshot === 'object' && snapshot !== null && !Array.isArray(snapshot)
      ? (snapshot as Partial<RiskReviewSnapshot>)
      : {};
  return {
    risks: Array.isArray(record.risks) ? record.risks : [],
    totals: record.totals ?? {},
    acceptanceRequiredFromLevel: record.acceptanceRequiredFromLevel ?? null,
  };
}

/** Periodic risk reviews, one row each (ISO 27001 6.1.2, 8.2). */
export async function buildRiskReviewsCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const reviews = await db.riskReview.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
  return toCsv({
    headers: [
      'Review ID',
      'Signed off at',
      'Signed off by',
      'Reason',
      'Risks',
      'Without owner',
      'Awaiting acceptance',
      'Stale acceptance',
      'Open actions',
      'Overdue actions',
      'Notes',
      'Next review due',
    ],
    rows: reviews.map((review) => {
      const { totals } = snapshotOf(review.snapshot);
      return [
        review.id,
        review.createdAt,
        review.reviewedByName,
        humanize(review.trigger),
        totals.risks,
        totals.withoutOwner,
        totals.awaitingAcceptance,
        totals.staleAcceptance,
        totals.openActions,
        totals.overdueActions,
        review.notes,
        review.nextReviewDue,
      ];
    }),
  });
}

export const RISK_REVIEW_SNAPSHOT_HEADERS = [
  'Risk ID',
  'Risk',
  'Category',
  'Status',
  'Inherent level',
  'Residual level',
  'Treatment',
  'Owner',
  'Acceptance',
  'Open actions',
  'Overdue actions',
];

export function riskReviewSnapshotRows(snapshot: Prisma.JsonValue): string[][] {
  return snapshotOf(snapshot).risks.map((r) => [
    r.id,
    r.title,
    humanize(r.category),
    humanize(r.status),
    level(r.inherentLevel),
    level(r.residualLevel),
    humanize(r.treatmentStrategy),
    r.ownerName ?? 'Unassigned',
    humanize(r.acceptance),
    String(r.openActions),
    String(r.overdueActions),
  ]);
}

/** One review's frozen register as CSV (the "Download CSV" of a risk review). */
export function buildRiskReviewSnapshotCsv(snapshot: Prisma.JsonValue): string {
  return toCsv({
    headers: RISK_REVIEW_SNAPSHOT_HEADERS,
    rows: riskReviewSnapshotRows(snapshot),
  });
}

/** Risk treatment actions across the register (ISO 27001 6.1.3, 8.3). */
export async function buildRiskTreatmentActionsCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const risks = await db.risk.findMany({
    where: { organizationId },
    select: { id: true, title: true },
  });
  const riskTitle = new Map(risks.map((r) => [r.id, r.title]));
  const actions = await db.taskItem.findMany({
    where: { organizationId, entityType: 'risk', entityId: { in: [...riskTitle.keys()] } },
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
      entityId: true,
      assignee: { select: { user: { select: { name: true, email: true } } } },
    },
  });
  const now = new Date();
  return toCsv({
    headers: [
      'Action ID',
      'Risk',
      'Action',
      'Status',
      'Priority',
      'Owner',
      'Created',
      'Due',
      'Completed',
      'Overdue',
    ],
    rows: actions.map((a) => [
      a.id,
      riskTitle.get(a.entityId),
      a.title,
      humanize(a.status),
      humanize(a.priority),
      personName(a.assignee?.user),
      a.createdAt,
      a.dueDate,
      a.completedAt,
      isActionOverdue({ status: a.status, dueDate: a.dueDate, now }),
    ]),
  });
}
