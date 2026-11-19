import type { OverviewData } from './overview-data';
import { DAY_MS } from './overview-utils';
import {
  APPROVAL_STALE_DAYS,
  ACCESS_REVIEW_INTERVAL_DAYS,
  card,
  reasons,
  type AttentionCard,
} from './overview-attention-types';
import { buildModuleCards } from './overview-attention-modules';
import { peopleCard, trainingCard, vendorsCard } from './overview-attention-people';
import { policyAckCoverage } from './policy-ack-coverage';

export * from './overview-attention-types';

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
  const approvalStale = data.policies.filter(
    (p) =>
      p.submittedForApprovalAt &&
      t - p.submittedForApprovalAt.getTime() > APPROVAL_STALE_DAYS * DAY_MS,
  ).length;
  const reviewOverdue = data.policies.filter(
    (p) => p.status === 'published' && isPast(p.reviewDate),
  ).length;

  const acks = policyAckCoverage({ policies: data.policies, members: data.members });

  const failingChecks = data.checkRuns.filter(
    (run) => run.failedCount > 0,
  ).length;
  const erroredChecks = data.checkRuns.filter(
    (run) => run.failedCount === 0 && run.status === 'failed',
  ).length;

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
      total: data.taskProgress.total,
      ok: tasksOk,
      needsAttention: data.taskProgress.total - tasksOk,
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
        [`Waiting for approval over ${APPROVAL_STALE_DAYS} days`, approvalStale],
        ['Waiting for approval', needsReviewPolicies - approvalStale],
        ['Draft', draftPolicies],
      ]),
    }),
    card({
      module: 'acknowledgements',
      label: 'Policy acknowledgements',
      total: acks.total,
      needsAttention: acks.pending,
      href: '/people',
      reasons: reasons([
        ['People with pending sign-offs', acks.peoplePending.size],
        ['Policies awaiting sign-off', acks.policiesPending.size],
      ]),
    }),
    trainingCard({ data, now }),
    peopleCard({ data }),
    vendorsCard({ data, now }),
    ...buildModuleCards({ data, now }),
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
