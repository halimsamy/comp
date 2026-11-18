'use client';

import { useVendorReviews, type SignOffVendorReviewInput } from '@/hooks/use-vendor-tpsp';
import { useVendor } from '@/hooks/use-vendors';
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from '@trycompai/design-system';
import { CheckmarkFilled, CheckmarkOutline, CircleDash } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  daysUntil,
  formatDate,
  REVIEW_OUTCOME,
  REVIEW_STATUS,
  reviewCadenceMonths,
} from '../../../lib/vendor-tpsp';
import { SignOffReviewSheet } from './SignOffReviewSheet';

const CHECK_LABELS = {
  assuranceReviewed: 'Assurance report',
  pciStatusConfirmed: 'PCI DSS status',
  contractReviewed: 'Contract',
  riskReassessed: 'Risk re-assessed',
} as const;

function dueText(nextReviewDue: string | null | undefined) {
  if (!nextReviewDue) return 'No review scheduled';
  const days = daysUntil({ date: nextReviewDue });
  if (days < 0) return `Overdue by ${-days} days`;
  if (days === 0) return 'Due today';
  return `Due in ${days} days (${formatDate(nextReviewDue)})`;
}

/** Periodic vendor reviews: current status, sign-off and history (ISO A.5.22, PCI 12.8.4). */
export function VendorReviewsTab({
  vendorId,
  canUpdate,
}: {
  vendorId: string;
  canUpdate: boolean;
}) {
  const { vendor, mutate: refreshVendor } = useVendor(vendorId);
  const { reviews, error, isLoading, signOffReview } = useVendorReviews(vendorId);
  const [signing, setSigning] = useState(false);

  const status = REVIEW_STATUS[vendor?.reviewStatus ?? 'never_reviewed'];
  const months = reviewCadenceMonths(vendor ?? {});
  const cadenceLabel = months === 12 ? 'annual' : `${months}-month`;

  const handleSignOff = async (input: SignOffVendorReviewInput) => {
    try {
      await signOffReview(input);
      await refreshVendor();
      toast.success('Review signed off');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to sign off the review');
      throw caught;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-md border border-border bg-background p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-normal tracking-[-0.01em]">Periodic review</h3>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <span className="text-sm">{dueText(vendor?.nextReviewDue)}</span>
          <span className="text-xs text-muted-foreground">
            {vendor?.lastReviewedAt
              ? `Last reviewed ${formatDate(vendor.lastReviewedAt)}. `
              : 'Never reviewed. '}
            Reviewed on a {cadenceLabel} cadence based on criticality
            {vendor?.handlesCardholderData || vendor?.affectsCdeSecurity
              ? ' and PCI DSS scope (12.8.4)'
              : ''}
            .
          </span>
        </div>
        {canUpdate && (
          <Button iconLeft={<CheckmarkOutline size={16} />} onClick={() => setSigning(true)}>
            Sign off review
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border bg-background p-4 sm:p-6">
        <h3 className="text-base font-medium">Review history</h3>
        {error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load reviews.</p>
        ) : isLoading && reviews.length === 0 ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : reviews.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No reviews yet</EmptyTitle>
              <EmptyDescription>
                Review the vendor&apos;s assurance report, PCI DSS status and contract, then sign
                off. Each sign-off is kept as audit evidence.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {reviews.map((review) => {
              const outcome = REVIEW_OUTCOME[review.outcome];
              return (
                <li key={review.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={outcome.variant}>{outcome.label}</Badge>
                    <span className="font-medium">{review.reviewedByName}</span>
                    <span className="text-muted-foreground">
                      on {formatDate(review.reviewedAt)} · next due{' '}
                      {formatDate(review.nextReviewDue)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {(Object.keys(CHECK_LABELS) as (keyof typeof CHECK_LABELS)[]).map((key) => (
                      <span
                        key={key}
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        {review.checklist[key] ? (
                          <CheckmarkFilled size={14} className="text-primary" />
                        ) : (
                          <CircleDash size={14} />
                        )}
                        {CHECK_LABELS[key]}
                      </span>
                    ))}
                  </div>
                  {review.notes && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {review.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <SignOffReviewSheet
        open={signing}
        onOpenChange={setSigning}
        cadenceLabel={cadenceLabel}
        onSignOff={handleSignOff}
      />
    </div>
  );
}
