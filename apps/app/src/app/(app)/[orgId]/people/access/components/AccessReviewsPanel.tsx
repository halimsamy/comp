'use client';

import {
  useAccessMutations,
  useAccessReviews,
  useAccessSystems,
  type AccessReviewSummary,
} from '@/hooks/use-access-reviews';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Progress,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatDay } from '../lib/access-labels';
import type { OwnerOption } from './AccountOwnerDialog';
import { StartReviewSheet, type ReviewValues } from './StartReviewSheet';

export function reviewStatus(review: Pick<AccessReviewSummary, 'status' | 'dueDate'>, now = new Date()) {
  if (review.status === 'completed') return { label: 'Completed', variant: 'default' as const };
  if (new Date(review.dueDate) < now) return { label: 'Overdue', variant: 'destructive' as const };
  return { label: 'In progress', variant: 'accent' as const };
}

/** Access reviews list with progress, plus "Start review". */
export function AccessReviewsPanel({ orgId, members }: { orgId: string; members: OwnerOption[] }) {
  const router = useRouter();
  const { reviews, isLoading, error, mutate } = useAccessReviews();
  const { systems } = useAccessSystems();
  const { createReview } = useAccessMutations();
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('member', 'update');
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleStart = async (values: ReviewValues) => {
    try {
      const review = await createReview({
        name: values.name,
        dueDate: values.dueDate,
        systems: values.systems
          .filter((s) => s.selected)
          .map((s) => ({ systemKey: s.systemKey, reviewerMemberId: s.reviewerMemberId || undefined })),
      });
      await mutate();
      toast.success('Access review started');
      router.push(`/${orgId}/people/access/reviews/${review.id}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to start the review');
      throw caught;
    }
  };

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-6">
        <Text variant="muted">Couldn&apos;t load access reviews.</Text>
        <Button size="sm" variant="outline" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Text size="sm" variant="muted">
          Review who has access to each system at least every six months (PCI DSS 7.2.4, ISO 27001
          A.5.18). Signing off attaches the report to the Access Review Log task.
        </Text>
        {canUpdate && (
          <div className="shrink-0">
            <Button iconLeft={<Add size={16} />} onClick={() => setSheetOpen(true)} disabled={systems.length === 0}>
              Start review
            </Button>
          </div>
        )}
      </div>

      {isLoading && reviews.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : reviews.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No access reviews yet</EmptyTitle>
            <EmptyDescription>
              Start a review to snapshot every account, flag leavers, unmapped and inactive accounts,
              and record a keep, revoke or modify decision for each one.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Review</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Flagged</TableHead>
              <TableHead>End date</TableHead>
              <TableHead>Signed off</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((review) => {
              const status = reviewStatus(review);
              const { decided, total, flagged } = review.progress;
              return (
                <TableRow key={review.id}>
                  <TableCell>
                    <div className="flex min-w-[200px] flex-col">
                      <Link href={`/${orgId}/people/access/reviews/${review.id}`} className="font-medium hover:underline">
                        {review.name}
                      </Link>
                      <Text size="xs" variant="muted">
                        {review.systems.map((s) => s.systemName).join(', ')}
                      </Text>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-[140px] flex-col gap-1">
                      <Text size="xs" variant="muted">
                        {decided} of {total} reviewed
                      </Text>
                      <Progress value={total ? Math.round((decided / total) * 100) : 0} />
                    </div>
                  </TableCell>
                  <TableCell>{flagged}</TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap">{formatDay(review.dueDate)}</span>
                  </TableCell>
                  <TableCell>
                    {review.signedOffAt ? `${review.signedOffByName ?? ''} · ${formatDay(review.signedOffAt)}` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <StartReviewSheet
        open={sheetOpen}
        systems={systems}
        members={members}
        existingNames={reviews.map((r) => r.name)}
        onOpenChange={setSheetOpen}
        onStart={handleStart}
      />
    </div>
  );
}
