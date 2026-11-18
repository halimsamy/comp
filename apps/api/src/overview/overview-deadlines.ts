import { DOCUMENT_TYPE_LABEL } from '../vendors/tpsp/vendor-reminders';
import { ACCESS_REVIEW_INTERVAL_DAYS } from './overview-attention';
import {
  DAY_MS,
  newestDocuments,
  personName,
  type OverviewData,
} from './overview-data';
import { latestTraining } from './overview-training';

export type DeadlineType =
  | 'task'
  | 'policy_review'
  | 'vendor_review'
  | 'vendor_document'
  | 'training'
  | 'access_review';

export interface DeadlineItem {
  id: string;
  type: DeadlineType;
  title: string;
  subtitle: string | null;
  dueDate: string;
  /** Org-relative deep link. */
  href: string;
  ownerName: string | null;
}

export interface Deadlines {
  windowDays: number;
  overdueCount: number;
  dueSoonCount: number;
  overdue: DeadlineItem[];
  dueSoon: DeadlineItem[];
}

export const DEFAULT_DEADLINE_WINDOW_DAYS = 30;
const MAX_ITEMS_PER_GROUP = 100;

/**
 * One overdue / due-soon queue across modules: tasks (next due date), policy
 * reviews, vendor reviews and assurance documents, training renewals and
 * access reviews. Items due after `now + windowDays` are left out.
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
  const items: Array<Omit<DeadlineItem, 'dueDate'> & { due: Date }> = [];

  for (const task of data.tasks) {
    if (!task.reviewDate) continue;
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

  const membersById = new Map(data.members.map((m) => [m.id, m]));
  for (const entry of latestTraining({ data })) {
    const member = membersById.get(entry.memberId);
    items.push({
      id: `${entry.memberId}:${entry.title}`,
      type: 'training',
      title: entry.title,
      subtitle: member
        ? `Renewal for ${member.user.name || member.user.email}`
        : 'Training renewal',
      due: entry.expiresAt,
      href: `/people/${entry.memberId}`,
      ownerName: member ? member.user.name || member.user.email : null,
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
  const sorted = items.sort((a, b) => a.due.getTime() - b.due.getTime());
  const toItem = ({ due, ...rest }: (typeof items)[number]): DeadlineItem => ({
    ...rest,
    dueDate: due.toISOString(),
  });
  const overdue = sorted.filter((i) => i.due.getTime() < t);
  const dueSoon = sorted.filter(
    (i) => i.due.getTime() >= t && i.due.getTime() <= horizon,
  );
  return {
    windowDays,
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    overdue: overdue.slice(0, MAX_ITEMS_PER_GROUP).map(toItem),
    dueSoon: dueSoon.slice(0, MAX_ITEMS_PER_GROUP).map(toItem),
  };
}
