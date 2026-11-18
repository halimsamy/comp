import {
  isExpiringSoon,
  reviewStatus,
} from '../vendors/tpsp/vendor-review-status';
import { latestTraining } from './overview-training';
import { DAY_MS, newestDocuments, type OverviewData } from './overview-data';

export type AttentionModule =
  | 'tasks'
  | 'policies'
  | 'acknowledgements'
  | 'training'
  | 'vendors'
  | 'checks'
  | 'findings'
  | 'accessReviews';

export interface AttentionReason {
  label: string;
  count: number;
}

export interface AttentionCard {
  module: AttentionModule;
  label: string;
  /** Items that need someone to act. */
  needsAttention: number;
  ok: number;
  total: number;
  /** Org-relative deep link, e.g. `/tasks`. */
  href: string;
  reasons: AttentionReason[];
}

/** PCI DSS 7.2.4: user accounts and access privileges are reviewed at least once every six months. */
export const ACCESS_REVIEW_INTERVAL_DAYS = 183;
export const TRAINING_EXPIRY_WINDOW_DAYS = 30;

const reasons = (entries: Array<[string, number]>): AttentionReason[] =>
  entries
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));

function card(
  input: Omit<AttentionCard, 'ok'> & { ok?: number },
): AttentionCard {
  return {
    ...input,
    ok: input.ok ?? Math.max(0, input.total - input.needsAttention),
  };
}

export function buildAttentionCards({
  data,
  now = new Date(),
}: {
  data: OverviewData;
  now?: Date;
}): AttentionCard[] {
  const t = now.getTime();
  const isPast = (date: Date | null) => !!date && date.getTime() < t;

  // Tasks: OK only when done and not yet due again.
  const overdueTasks = data.tasks.filter((task) => isPast(task.reviewDate));
  const failedTasks = data.tasks.filter(
    (task) => task.status === 'failed' && !isPast(task.reviewDate),
  );
  const inReviewTasks = data.tasks.filter(
    (task) => task.status === 'in_review' && !isPast(task.reviewDate),
  );
  const openTasks = data.tasks.filter(
    (task) =>
      (task.status === 'todo' || task.status === 'in_progress') &&
      !isPast(task.reviewDate),
  );
  const tasksOk = data.tasks.filter(
    (task) => task.status === 'done' && !isPast(task.reviewDate),
  ).length;

  // Policies: OK when published and inside their review cycle.
  const draftPolicies = data.policies.filter(
    (p) => p.status === 'draft',
  ).length;
  const needsReviewPolicies = data.policies.filter(
    (p) => p.status === 'needs_review',
  ).length;
  const reviewOverdue = data.policies.filter(
    (p) => p.status === 'published' && isPast(p.reviewDate),
  ).length;

  // Acknowledgements: one per (required published policy, member who can see it).
  let ackTotal = 0;
  let ackPending = 0;
  const peoplePending = new Set<string>();
  const policiesPending = new Set<string>();
  for (const policy of data.policies) {
    if (!policy.isRequiredToSign || policy.status !== 'published') continue;
    for (const member of data.members) {
      if (
        policy.visibility === 'DEPARTMENT' &&
        !policy.visibleToDepartments.includes(member.department)
      ) {
        continue;
      }
      ackTotal++;
      if (policy.signedBy.includes(member.id)) continue;
      ackPending++;
      peoplePending.add(member.id);
      policiesPending.add(policy.id);
    }
  }

  const training = latestTraining({ data });
  const trainingExpired = training.filter(
    (entry) => entry.expiresAt.getTime() < t,
  ).length;
  const trainingExpiring = training.filter(
    (entry) =>
      entry.expiresAt.getTime() >= t &&
      entry.expiresAt.getTime() - t <= TRAINING_EXPIRY_WINDOW_DAYS * DAY_MS,
  ).length;

  // Vendors: review cadence and assurance documents (vendor-review rules).
  let vendorsReviewOverdue = 0;
  let vendorsNeverReviewed = 0;
  let vendorsDocsExpiring = 0;
  let vendorsNeedingAttention = 0;
  for (const vendor of data.vendors) {
    const status = reviewStatus({
      lastReviewedAt: vendor.lastReviewedAt,
      nextReviewDue: vendor.nextReviewDue,
      now,
    });
    const inScope =
      vendor.criticality === 'critical' ||
      vendor.criticality === 'high' ||
      vendor.handlesCardholderData ||
      vendor.affectsCdeSecurity;
    const overdue = status === 'overdue';
    const neverReviewed = status === 'never_reviewed' && inScope;
    const docsExpiring = newestDocuments(vendor.documents).some((doc) =>
      isExpiringSoon({ expiresAt: doc.expiresAt, now }),
    );
    if (overdue) vendorsReviewOverdue++;
    if (neverReviewed) vendorsNeverReviewed++;
    if (docsExpiring) vendorsDocsExpiring++;
    if (overdue || neverReviewed || docsExpiring) vendorsNeedingAttention++;
  }

  const failingChecks = data.checkRuns.filter(
    (run) => run.failedCount > 0,
  ).length;
  const erroredChecks = data.checkRuns.filter(
    (run) => run.failedCount === 0 && run.status === 'failed',
  ).length;

  const findingCount = (status: string) =>
    data.findings.find((f) => f.status === status)?.count ?? 0;
  const findingsTotal = data.findings.reduce((sum, f) => sum + f.count, 0);
  const openFindings = findingCount('open');
  const revisionFindings = findingCount('needs_revision');
  const readyFindings = findingCount('ready_for_review');

  const reviewsOverdue = data.accessReviews.filter(
    (r) => r.status === 'in_progress' && isPast(r.dueDate),
  ).length;
  const lastSignOff = Math.max(
    0,
    ...data.accessReviews.map((r) => r.signedOffAt?.getTime() ?? 0),
  );
  const accessReviewStale =
    t - lastSignOff > ACCESS_REVIEW_INTERVAL_DAYS * DAY_MS ? 1 : 0;

  return [
    card({
      module: 'tasks',
      label: 'Evidence tasks',
      total: data.tasks.length,
      ok: tasksOk,
      needsAttention: data.tasks.length - tasksOk,
      href: '/tasks',
      reasons: reasons([
        ['Overdue', overdueTasks.length],
        ['Failed', failedTasks.length],
        ['Waiting for review', inReviewTasks.length],
        ['Not complete', openTasks.length],
      ]),
    }),
    card({
      module: 'policies',
      label: 'Policies',
      total: data.policies.length,
      needsAttention: draftPolicies + needsReviewPolicies + reviewOverdue,
      href: '/policies',
      reasons: reasons([
        ['Review overdue', reviewOverdue],
        ['Needs review', needsReviewPolicies],
        ['Draft', draftPolicies],
      ]),
    }),
    card({
      module: 'acknowledgements',
      label: 'Policy acknowledgements',
      total: ackTotal,
      needsAttention: ackPending,
      href: '/people/all',
      reasons: reasons([
        ['People with pending sign-offs', peoplePending.size],
        ['Policies awaiting sign-off', policiesPending.size],
      ]),
    }),
    card({
      module: 'training',
      label: 'Training',
      total: training.length,
      needsAttention: trainingExpired + trainingExpiring,
      href: '/people/all',
      reasons: reasons([
        ['Expired', trainingExpired],
        [`Expiring in ${TRAINING_EXPIRY_WINDOW_DAYS} days`, trainingExpiring],
      ]),
    }),
    card({
      module: 'vendors',
      label: 'Vendors',
      total: data.vendors.length,
      needsAttention: vendorsNeedingAttention,
      href: '/vendors',
      reasons: reasons([
        ['Review overdue', vendorsReviewOverdue],
        ['Never reviewed', vendorsNeverReviewed],
        ['Documents expired or expiring', vendorsDocsExpiring],
      ]),
    }),
    card({
      module: 'checks',
      label: 'Integration checks',
      total: data.checkRuns.length,
      needsAttention: failingChecks + erroredChecks,
      href: '/integrations',
      reasons: reasons([
        ['Failing', failingChecks],
        ['Errored', erroredChecks],
      ]),
    }),
    card({
      module: 'findings',
      label: 'Audit findings',
      total: findingsTotal,
      needsAttention: openFindings + revisionFindings + readyFindings,
      href: '/overview/findings',
      reasons: reasons([
        ['Open', openFindings],
        ['Needs revision', revisionFindings],
        ['Ready for review', readyFindings],
      ]),
    }),
    card({
      module: 'accessReviews',
      label: 'Access reviews',
      total: data.accessReviews.length,
      ok: data.accessReviews.filter((r) => r.status === 'completed').length,
      needsAttention: reviewsOverdue + accessReviewStale,
      href: '/people/access',
      reasons: reasons([
        ['Overdue', reviewsOverdue],
        ['None signed off in the last 6 months', accessReviewStale],
      ]),
    }),
  ];
}
