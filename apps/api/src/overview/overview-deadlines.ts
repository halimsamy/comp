import { DOCUMENT_TYPE_LABEL } from '../vendors/tpsp/vendor-reminders';
import { ACCESS_REVIEW_INTERVAL_DAYS } from './overview-attention-types';
import type { OverviewData } from './overview-data';
import { DAY_MS, newestDocuments, personName } from './overview-utils';
import {
  moduleDeadlines,
  type ModuleDeadlineType,
  type RawDeadline,
} from './overview-deadline-sources';

export type DeadlineType =
  | 'task'
  | 'policy_review'
  | 'vendor_review'
  | 'vendor_document'
  | 'training'
  | 'access_review'
  | ModuleDeadlineType;

export interface DeadlineItem {
  id: string;
  type: DeadlineType;
  title: string;
  subtitle: string | null;
  /** ISO date; null only in `noDueDate`. */
  dueDate: string | null;
  /** Org-relative deep link. */
  href: string;
  ownerName: string | null;
}

export interface Deadlines {
  windowDays: number;
  overdueCount: number;
  dueSoonCount: number;
  noDueDateCount: number;
  overdue: DeadlineItem[];
  dueSoon: DeadlineItem[];
  /** Open work nobody put a date on, so it can never show as overdue. */
  noDueDate: DeadlineItem[];
}

export const DEFAULT_DEADLINE_WINDOW_DAYS = 30;
const MAX_ITEMS_PER_GROUP = 100;

/**
 * One overdue / due-soon queue across every module: tasks, policy reviews and
 * approvals, vendors, training, access reviews, plus the newer modules (see
 * `moduleDeadlines`). Items due after `now + windowDays` are left out; open
 * items without a date go to `noDueDate`.
 */
export function buildDeadlines({
  data,
  now = new Date(),
  windowDays = DEFAULT_DEADLINE_WINDOW_DAYS,
}: {
  data: OverviewData;
  now?: Date;
  windowDays?: number;
}): Deadlines {
  const items: Array<RawDeadline<DeadlineType>> = [...moduleDeadlines(data)];

  for (const task of data.tasks) {
    // Done tasks without a next date are not due again.
    if (!task.reviewDate && task.status === 'done') continue;
    items.push({
      id: task.id,
      type: 'task',
      title: task.title,
      subtitle: 'Evidence task',
      due: task.reviewDate,
      href: `/tasks/${task.id}`,
      ownerName: personName(task.assignee),
    });
  }

  for (const policy of data.policies) {
    if (policy.status !== 'published' || !policy.reviewDate) continue;
    items.push({
      id: policy.id,
      type: 'policy_review',
      title: policy.name,
      subtitle: 'Policy review',
      due: policy.reviewDate,
      href: `/policies/${policy.id}`,
      ownerName: personName(policy.assignee),
    });
  }

  for (const vendor of data.vendors) {
    if (vendor.nextReviewDue) {
      items.push({
        id: vendor.id,
        type: 'vendor_review',
        title: vendor.name,
        subtitle: 'Vendor review',
        due: vendor.nextReviewDue,
        href: `/vendors/${vendor.id}`,
        ownerName: personName(vendor.assignee),
      });
    }
    for (const doc of newestDocuments(vendor.documents)) {
      items.push({
        id: `${vendor.id}:${doc.type}`,
        type: 'vendor_document',
        title: `${vendor.name}: ${DOCUMENT_TYPE_LABEL[doc.type]}`,
        subtitle: 'Vendor document expires',
        due: doc.expiresAt,
        href: `/vendors/${vendor.id}`,
        ownerName: personName(vendor.assignee),
      });
    }
  }

  // Training renewals: the same rule as the Training card (trainingStatusForOrg).
  for (const member of data.training.members) {
    if (!member.expiresAt || member.status === 'not_required') continue;
    const name = member.name || member.email;
    items.push({
      id: `${member.memberId}:training`,
      type: 'training',
      title: 'Security awareness training',
      subtitle: `Renewal for ${name}`,
      due: member.expiresAt,
      href: `/people/${member.memberId}`,
      ownerName: name,
    });
  }

  const openReviews = data.accessReviews.filter(
    (r) => r.status === 'in_progress',
  );
  for (const review of openReviews) {
    items.push({
      id: review.id,
      type: 'access_review',
      title: review.name,
      subtitle: 'Access review',
      due: review.dueDate,
      href: '/people/access',
      ownerName: null,
    });
  }
  const lastSignOff = Math.max(
    0,
    ...data.accessReviews.map((r) => r.signedOffAt?.getTime() ?? 0),
  );
  if (openReviews.length === 0 && lastSignOff > 0) {
    items.push({
      id: 'next-access-review',
      type: 'access_review',
      title: 'Next periodic access review',
      subtitle: 'PCI DSS 7.2.4 · every 6 months',
      due: new Date(lastSignOff + ACCESS_REVIEW_INTERVAL_DAYS * DAY_MS),
      href: '/people/access',
      ownerName: null,
    });
  }

  const t = now.getTime();
  const horizon = t + windowDays * DAY_MS;
  const toItem = ({ due, ...rest }: RawDeadline<DeadlineType>): DeadlineItem => ({
    ...rest,
    dueDate: due ? due.toISOString() : null,
  });
  const dated = items
    .filter((i): i is RawDeadline<DeadlineType> & { due: Date } => !!i.due)
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const overdue = dated.filter((i) => i.due.getTime() < t);
  const dueSoon = dated.filter(
    (i) => i.due.getTime() >= t && i.due.getTime() <= horizon,
  );
  const noDueDate = items.filter((i) => !i.due);
  return {
    windowDays,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    noDueDateCount: noDueDate.length,
    overdue: overdue.slice(0, MAX_ITEMS_PER_GROUP).map(toItem),
    dueSoon: dueSoon.slice(0, MAX_ITEMS_PER_GROUP).map(toItem),
    noDueDate: noDueDate.slice(0, MAX_ITEMS_PER_GROUP).map(toItem),
  };
}
