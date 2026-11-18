import type {
  Audit,
  AuditReadiness,
  AuditRequestStatus,
  AuditRequirement,
  AuditReviewStatus,
  AuditStatus,
} from '@/hooks/use-audits';
import { format } from 'date-fns';

type BadgeVariant = 'default' | 'accent' | 'secondary' | 'destructive' | 'outline';

export const AUDIT_STATUS_LABELS: Record<AuditStatus, string> = {
  planned: 'Planned',
  in_progress: 'In audit',
  awaiting_report: 'Awaiting report',
  completed: 'Completed',
};

/** One status per requirement: the auditor's assessment wins over computed readiness. */
export type ItemStatus = AuditReviewStatus | AuditReadiness;

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  not_ready: 'Not ready',
  needs_update: 'Needs update',
  ready: 'Ready for audit',
  requested: 'Requested',
  flagged: 'Flagged',
  accepted: 'Accepted',
  not_applicable: 'Not applicable',
};

export const ITEM_STATUS_ORDER: ItemStatus[] = [
  'not_ready',
  'needs_update',
  'ready',
  'requested',
  'flagged',
  'accepted',
  'not_applicable',
];

const ITEM_BADGES: Record<ItemStatus, BadgeVariant> = {
  not_ready: 'destructive',
  needs_update: 'destructive',
  ready: 'accent',
  requested: 'outline',
  flagged: 'destructive',
  accepted: 'default',
  not_applicable: 'secondary',
};

export const itemBadgeVariant = (status: ItemStatus): BadgeVariant => ITEM_BADGES[status];

export function itemStatus(requirement: Pick<AuditRequirement, 'readiness' | 'review'>): ItemStatus {
  if (requirement.readiness === 'not_applicable') return 'not_applicable';
  return requirement.review?.status ?? requirement.readiness;
}

export function countByStatus(requirements: AuditRequirement[]): Record<ItemStatus, number> {
  const counts = Object.fromEntries(ITEM_STATUS_ORDER.map((s) => [s, 0])) as Record<
    ItemStatus,
    number
  >;
  for (const requirement of requirements) counts[itemStatus(requirement)]++;
  return counts;
}

export const REQUEST_STATUS_LABELS: Record<AuditRequestStatus, string> = {
  open: 'Waiting on team',
  submitted: 'Waiting on auditor',
  accepted: 'Accepted',
};

export const requestBadgeVariant = (status: AuditRequestStatus): BadgeVariant =>
  status === 'accepted' ? 'default' : status === 'submitted' ? 'accent' : 'outline';

export const formatDay = (value: string) => format(new Date(value), 'MMM d, yyyy');

export const formatPeriod = (audit: Pick<Audit, 'periodStart' | 'periodEnd'>) =>
  `${formatDay(audit.periodStart)} – ${formatDay(audit.periodEnd)}`;

/** The day an ISO timestamp falls on, as YYYY-MM-DD (UTC, matching the API). */
export const toDay = (value: string | null) => (value ? value.slice(0, 10) : '');

export const isActiveAudit = (audit: Pick<Audit, 'status'>) => audit.status !== 'completed';

export function accessLabel(audit: Pick<Audit, 'accessEndsAt'>, now = new Date()): string {
  if (!audit.accessEndsAt) return 'Auditor access has no end date';
  const end = new Date(audit.accessEndsAt);
  return end < now
    ? `Auditor access ended ${formatDay(audit.accessEndsAt)}`
    : `Auditor access until ${formatDay(audit.accessEndsAt)}`;
}
