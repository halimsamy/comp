import type {
  Impact,
  Likelihood,
  VendorCriticality,
  VendorDocumentType,
  VendorStatus,
} from '@db';
import { ratingLevel } from '../../risks/risk-level';

/** Months between periodic reviews, by criticality (null = not yet classified). */
export const REVIEW_CADENCE_MONTHS: Record<
  VendorCriticality | 'unset',
  number
> = {
  critical: 6,
  high: 12,
  medium: 12,
  low: 24,
  unset: 12,
};

/** "Due soon" window for reviews and "expiring" window for documents. */
export const DUE_SOON_DAYS = 30;
export const EXPIRING_SOON_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export type VendorReviewStatus =
  'never_reviewed' | 'overdue' | 'due_soon' | 'current';

/**
 * Review cadence in months. A TPSP that shares account data or can affect the
 * CDE is checked at least every 12 months (PCI DSS 12.8.4).
 */
export function reviewCadenceMonths({
  criticality,
  handlesCardholderData,
  affectsCdeSecurity,
}: {
  criticality: VendorCriticality | null;
  handlesCardholderData: boolean;
  affectsCdeSecurity: boolean;
}): number {
  const months = REVIEW_CADENCE_MONTHS[criticality ?? 'unset'];
  if (handlesCardholderData || affectsCdeSecurity) return Math.min(months, 12);
  return months;
}

export function addMonths({ date, months }: { date: Date; months: number }) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function reviewStatus({
  lastReviewedAt,
  nextReviewDue,
  now = new Date(),
}: {
  lastReviewedAt: Date | null;
  nextReviewDue: Date | null;
  now?: Date;
}): VendorReviewStatus {
  if (!nextReviewDue) return lastReviewedAt ? 'current' : 'never_reviewed';
  const msLeft = nextReviewDue.getTime() - now.getTime();
  if (msLeft < 0) return 'overdue';
  if (msLeft <= DUE_SOON_DAYS * DAY_MS) return 'due_soon';
  return 'current';
}

/** Expired or expiring within EXPIRING_SOON_DAYS. */
export function isExpiringSoon({
  expiresAt,
  now = new Date(),
}: {
  expiresAt: Date | null;
  now?: Date;
}): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now.getTime() <= EXPIRING_SOON_DAYS * DAY_MS;
}

/** Only the latest-expiring document of each type matters; older ones are superseded. */
export function latestDocumentsByType<
  T extends { type: VendorDocumentType; expiresAt: Date | null },
>(documents: T[]): T[] {
  const latest = new Map<VendorDocumentType, T>();
  for (const doc of documents) {
    if (!doc.expiresAt) continue;
    const current = latest.get(doc.type);
    if (!current?.expiresAt || current.expiresAt < doc.expiresAt)
      latest.set(doc.type, doc);
  }
  return [...latest.values()];
}

export type VendorAttentionReason =
  | 'not_assessed'
  | 'criticality_not_set'
  | 'review_overdue'
  | 'never_reviewed_in_scope'
  | 'docs_expiring';

export type AttentionVendor = {
  status: VendorStatus;
  criticality: VendorCriticality | null;
  handlesCardholderData: boolean;
  affectsCdeSecurity: boolean;
  inherentProbability: Likelihood;
  inherentImpact: Impact;
  lastReviewedAt: Date | null;
  nextReviewDue: Date | null;
  archivedAt?: Date | null;
  documents?: { type: VendorDocumentType; expiresAt: Date | null }[];
};

/**
 * In scope for a mandatory periodic review: critical/high criticality, PCI DSS
 * 12.8 scope (account data or CDE impact), or a high / very high inherent risk
 * (so unclassified risky vendors are not silently skipped).
 */
export function isVendorInReviewScope(
  vendor: Pick<
    AttentionVendor,
    | 'criticality'
    | 'handlesCardholderData'
    | 'affectsCdeSecurity'
    | 'inherentProbability'
    | 'inherentImpact'
  >,
): boolean {
  if (vendor.criticality === 'critical' || vendor.criticality === 'high')
    return true;
  if (vendor.handlesCardholderData || vendor.affectsCdeSecurity) return true;
  const level = ratingLevel(vendor.inherentProbability, vendor.inherentImpact);
  return level === 'high' || level === 'very-high';
}

/**
 * Why a vendor needs attention (empty = OK). The single rule shared by the
 * vendors list, reminders and the overview dashboard. Archived vendors never do.
 */
export function vendorNeedsAttention({
  vendor,
  now = new Date(),
}: {
  vendor: AttentionVendor;
  now?: Date;
}): VendorAttentionReason[] {
  if (vendor.archivedAt) return [];
  const reasons: VendorAttentionReason[] = [];
  if (vendor.status === 'not_assessed') reasons.push('not_assessed');
  if (!vendor.criticality) reasons.push('criticality_not_set');
  const status = reviewStatus({ ...vendor, now });
  if (status === 'overdue') reasons.push('review_overdue');
  if (status === 'never_reviewed' && isVendorInReviewScope(vendor))
    reasons.push('never_reviewed_in_scope');
  const docs = latestDocumentsByType(vendor.documents ?? []);
  if (docs.some((doc) => isExpiringSoon({ expiresAt: doc.expiresAt, now })))
    reasons.push('docs_expiring');
  return reasons;
}

/**
 * Computed review / document fields the vendors table and detail page show.
 * `documents` only needs the expiry dates (and type, to skip superseded ones).
 */
export function vendorComplianceSummary({
  vendor,
  now = new Date(),
}: {
  vendor: {
    lastReviewedAt: Date | null;
    nextReviewDue: Date | null;
    documents?: { type: VendorDocumentType; expiresAt: Date | null }[];
  };
  now?: Date;
}) {
  const expiries = latestDocumentsByType(vendor.documents ?? [])
    .map((d) => d.expiresAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    reviewStatus: reviewStatus({
      lastReviewedAt: vendor.lastReviewedAt,
      nextReviewDue: vendor.nextReviewDue,
      now,
    }),
    nextDocumentExpiry: expiries[0] ?? null,
    expiringDocumentsCount: expiries.filter((expiresAt) =>
      isExpiringSoon({ expiresAt, now }),
    ).length,
  };
}
