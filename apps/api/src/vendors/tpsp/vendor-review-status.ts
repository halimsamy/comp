import type { VendorCriticality } from '@db';

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

/**
 * Computed review / document fields the vendors table and detail page show.
 * `documents` only needs the expiry dates.
 */
export function vendorComplianceSummary({
  vendor,
  now = new Date(),
}: {
  vendor: {
    lastReviewedAt: Date | null;
    nextReviewDue: Date | null;
    documents?: { expiresAt: Date | null }[];
  };
  now?: Date;
}) {
  const expiries = (vendor.documents ?? [])
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
