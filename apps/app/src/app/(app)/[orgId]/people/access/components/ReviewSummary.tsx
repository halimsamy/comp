'use client';

import type { AccessReviewDetail } from '@/hooks/use-access-reviews';
import { Badge, Progress, Text } from '@trycompai/design-system';
import { formatDay } from '../lib/access-labels';
import { reviewStatus } from './AccessReviewsPanel';

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'warning' | 'destructive' }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-3">
      <Text size="xs" variant="muted">
        {label}
      </Text>
      <Text size="lg" weight="semibold" variant={tone ?? 'default'}>
        {value}
      </Text>
    </div>
  );
}

/** Status, progress and decision counts of one access review. */
export function ReviewSummary({ review }: { review: AccessReviewDetail }) {
  const status = reviewStatus(review);
  const { total, decided, kept, revoked, modified, flagged, pendingRemediation } = review.progress;
  const percent = total ? Math.round((decided / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        <Text size="sm" variant="muted">
          Due {formatDay(review.dueDate)} · started {formatDay(review.createdAt)}
          {review.createdByName ? ` by ${review.createdByName}` : ''}
        </Text>
        {review.signedOffAt && (
          <Text size="sm" variant="muted">
            Signed off by {review.signedOffByName} on {formatDay(review.signedOffAt)}
          </Text>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Text size="sm">
          {decided} of {total} accounts reviewed ({percent}%)
        </Text>
        <Progress value={percent} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Flagged" value={flagged} tone={flagged ? 'warning' : undefined} />
        <Stat label="Kept" value={kept} />
        <Stat label="Revoked" value={revoked} />
        <Stat label="Modified" value={modified} />
        <Stat label="Changes pending" value={pendingRemediation} tone={pendingRemediation ? 'destructive' : undefined} />
        <Stat label="Systems" value={review.systems.length} />
      </div>
      {review.signOffNote && (
        <Text size="sm" variant="muted">
          Sign-off note: {review.signOffNote}
        </Text>
      )}
    </div>
  );
}
