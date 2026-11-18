'use client';

import type { PolicyReview } from '@/hooks/use-policy-lifecycle';
import { Stack, Text } from '@trycompai/design-system';
import { format } from 'date-fns';

export function PolicyReviewHistory({ reviews }: { reviews: PolicyReview[] }) {
  if (reviews.length === 0) {
    return (
      <Text size="sm" variant="muted">
        No periodic reviews recorded yet. ISO 27001 (5.2, A.5.1) and PCI DSS (12.1.2) expect policies to
        be reviewed at least once a year — use “Mark as reviewed” when you do.
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      <Text size="sm" weight="medium">
        Review history
      </Text>
      <ul className="divide-y rounded-md border">
        {reviews.map((review) => (
          <li
            key={review.id}
            className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 space-y-1">
              <Text size="sm" weight="medium">
                {review.reviewer?.user.name || review.reviewer?.user.email || 'Removed member'}
                {review.policyVersion ? ` reviewed v${review.policyVersion.version}` : ' reviewed'}
              </Text>
              {review.notes && (
                <Text size="sm" variant="muted">
                  {review.notes}
                </Text>
              )}
            </div>
            <div className="shrink-0 sm:text-right">
              <Text size="xs" variant="muted">
                {format(new Date(review.reviewedAt), 'MMM d, yyyy')} · next{' '}
                {format(new Date(review.nextReviewDate), 'MMM d, yyyy')}
              </Text>
            </div>
          </li>
        ))}
      </ul>
    </Stack>
  );
}
