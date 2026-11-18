import { db, type TaskFrequency } from '@db';
import { reviewStatus } from '../../../vendors/tpsp/vendor-review-status';
import {
  fingerprintOf,
  formatDate,
  listIssue,
  monthsBefore,
  personLabel,
  type NativeEvidenceRule,
} from '../native-evidence.types';

const PERIOD_MONTHS: Partial<Record<TaskFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannually: 6,
};

/** The task's period, capped at six months (PCI DSS 7.2.4). */
export function accessReviewPeriodMonths(frequency: TaskFrequency | null): number {
  return (frequency && PERIOD_MONTHS[frequency]) ?? 6;
}

/** ISO 27001 A.5.18, A.6.5; PCI DSS 7.2.4, 8.2.5: signed access review and leavers offboarded. */
export const accessReviewRule: NativeEvidenceRule = {
  key: 'access_review_log',
  module: 'Access reviews',
  title: 'An access review was signed off this period and every leaver in the period was offboarded',
  reference: 'ISO/IEC 27001:2022 A.5.18, A.5.11, A.6.5; PCI DSS v4.0.1 7.2.4, 8.2.5',
  path: '/people?tab=access',
  async evaluate({ organizationId, now, frequency }) {
    const since = monthsBefore({ date: now, months: accessReviewPeriodMonths(frequency) });
    const [review, leavers, checklistSize] = await Promise.all([
      db.accessReview.findFirst({
        where: { organizationId, status: 'completed', signedOffAt: { gte: since } },
        orderBy: { signedOffAt: 'desc' },
        select: { id: true, name: true, signedOffAt: true, signedOffByName: true, _count: { select: { items: true } } },
      }),
      db.member.findMany({
        where: { organizationId, offboardDate: { gte: since, lte: now } },
        select: {
          id: true,
          deactivated: true,
          offboardDate: true,
          user: { select: { name: true, email: true } },
          offboardingChecklistCompletions: {
            where: { templateItem: { isEnabled: true, kind: 'offboarding' } },
            select: { completedAt: true },
          },
        },
        orderBy: { offboardDate: 'asc' },
      }),
      db.offboardingChecklistTemplate.count({
        where: { organizationId, isEnabled: true, kind: 'offboarding' },
      }),
    ]);
    // Without a checklist, deactivation (sign-out, access removed in CompAI) is the only record.
    const offboarded = (m: (typeof leavers)[number]) =>
      checklistSize > 0 ? m.offboardingChecklistCompletions.length >= checklistSize : m.deactivated;
    const open = leavers.filter((m) => !offboarded(m));

    return {
      holds: !!review && open.length === 0,
      summary: review
        ? `“${review.name}” signed off ${formatDate(review.signedOffAt)}; ${leavers.length - open.length} of ${leavers.length} leavers offboarded`
        : `No access review signed off since ${formatDate(since)}`,
      issues: [
        ...(review ? [] : ['Run a user access review and sign it off.']),
        ...listIssue({
          label: 'Offboarding not finished',
          names: open.map((m) => m.user.name || m.user.email),
        }),
      ],
      fingerprint: fingerprintOf(['access', review?.id ?? null, leavers.map((m) => [m.id, offboarded(m)])]),
      sections: [
        {
          heading: 'User access review',
          keyValues: [
            { label: 'Period', value: `${formatDate(since)} to ${formatDate(now)}` },
            { label: 'Review', value: review?.name ?? 'None signed off in this period' },
            { label: 'Accounts reviewed', value: review ? String(review._count.items) : '—' },
            {
              label: 'Management sign-off',
              value: review ? `${review.signedOffByName ?? '—'} on ${formatDate(review.signedOffAt)}` : '—',
            },
          ],
        },
        {
          heading: 'Leavers in the period',
          emptyText: 'Nobody left in this period.',
          ...(leavers.length > 0 && {
            table: {
              headers: ['Person', 'Left on', 'Checklist', 'Offboarded'],
              rows: leavers.map((m) => [
                personLabel(m.user),
                formatDate(m.offboardDate),
                checklistSize > 0 ? `${m.offboardingChecklistCompletions.length}/${checklistSize}` : '—',
                offboarded(m) ? 'Yes' : 'No',
              ]),
            },
          }),
        },
      ],
    };
  },
};

/** ISO 27001 A.5.19–A.5.22; PCI DSS 12.8.4: critical suppliers and TPSPs reviewed on cadence. */
export const supplierEvaluationRule: NativeEvidenceRule = {
  key: 'vendor_supplier_evaluation',
  module: 'Vendors',
  title: 'Every critical, high or PCI-relevant vendor has a review that is not overdue',
  reference: 'ISO/IEC 27001:2022 A.5.19, A.5.21, A.5.22; PCI DSS v4.0.1 12.8.4',
  path: '/vendors',
  async evaluate({ organizationId, now }) {
    const vendors = await db.vendor.findMany({
      where: {
        organizationId,
        OR: [
          { criticality: { in: ['critical', 'high'] } },
          { handlesCardholderData: true },
          { affectsCdeSecurity: true },
        ],
      },
      select: {
        id: true,
        name: true,
        criticality: true,
        lastReviewedAt: true,
        nextReviewDue: true,
        reviews: {
          orderBy: { reviewedAt: 'desc' },
          take: 1,
          select: { id: true, outcome: true, reviewedByName: true, reviewedAt: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    const rows = vendors.map((v) => ({
      vendor: v,
      status: reviewStatus({ lastReviewedAt: v.lastReviewedAt, nextReviewDue: v.nextReviewDue, now }),
    }));
    const late = rows.filter((r) => r.status === 'overdue' || r.status === 'never_reviewed');

    return {
      holds: rows.length > 0 && late.length === 0,
      summary: rows.length
        ? `${rows.length - late.length} of ${rows.length} critical vendors reviewed on time`
        : 'No critical vendors classified',
      issues: [
        ...(rows.length ? [] : ['Set criticality on your vendors so the critical ones can be tracked.']),
        ...listIssue({ label: 'Review overdue or missing', names: late.map((r) => r.vendor.name) }),
      ],
      fingerprint: fingerprintOf(rows.map((r) => [r.vendor.id, r.vendor.reviews[0]?.id ?? null])),
      sections: [
        {
          heading: 'Critical vendor reviews',
          intro: 'Vendors rated critical or high, or that handle account data or can affect the CDE, with their latest signed review.',
          emptyText: 'No critical vendors.',
          ...(rows.length > 0 && {
            table: {
              headers: ['Vendor', 'Criticality', 'Last review', 'Outcome', 'Reviewer', 'Next due', 'Status'],
              rows: rows.map(({ vendor, status }) => [
                vendor.name,
                vendor.criticality ?? 'Not set',
                formatDate(vendor.reviews[0]?.reviewedAt ?? vendor.lastReviewedAt),
                vendor.reviews[0]?.outcome.replace(/_/g, ' ') ?? '—',
                vendor.reviews[0]?.reviewedByName ?? '—',
                formatDate(vendor.nextReviewDue),
                status.replace(/_/g, ' '),
              ]),
            },
          }),
        },
      ],
    };
  },
};
