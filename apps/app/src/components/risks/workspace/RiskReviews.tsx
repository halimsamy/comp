'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useRiskReviews, useRiskWorkspaceMutations } from '@/hooks/use-risk-workspace';
import { LEVEL_LABEL } from '@/lib/risk-score';
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { CheckmarkOutline } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { RecordRiskReviewSheet, TRIGGER_LABEL, type RiskReviewValues } from './RecordRiskReviewSheet';
import { RiskReviewDetailDialog } from './RiskReviewDetailDialog';
import { daysUntil, formatDay, type WorkspaceMember } from './workspace-types';

function dueText(nextReviewDue: string | null) {
  if (!nextReviewDue) return 'No review recorded yet: one is due now.';
  const days = daysUntil({ value: nextReviewDue });
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'} (was due ${formatDay(nextReviewDue)}).`;
  if (days === 0) return 'Due today.';
  return `Next review due ${formatDay(nextReviewDue)} (in ${days} day${days === 1 ? '' : 's'}).`;
}

/** Periodic risk reviews (ISO 27001 8.2): status, sign-off and the frozen history. */
export function RiskReviews({ orgId, members }: { orgId: string; members: WorkspaceMember[] }) {
  const { reviews, settings, status, error, isLoading, mutate } = useRiskReviews();
  const { recordReview } = useRiskWorkspaceMutations();
  const { hasPermission } = usePermissions();
  const canRecord = hasPermission('risk', 'update');
  const [recording, setRecording] = useState(false);
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);

  const handleRecord = async (values: RiskReviewValues) => {
    try {
      await recordReview({
        trigger: values.trigger,
        notes: values.notes.trim() || undefined,
        reviewedById: values.reviewedById || undefined,
      });
      await mutate();
      toast.success('Risk review signed off');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to record the review');
      throw caught;
    }
  };

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-6">
        <Text variant="muted">
          Couldn&apos;t load risk reviews. Reviews cover the whole register, so they need access to
          every risk.
        </Text>
        <Button size="sm" variant="outline" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  const isOverdue = status?.isOverdue ?? false;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-md border border-border bg-background p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-normal tracking-[-0.01em]">Periodic risk review</h3>
            {status && (
              <Badge variant={isOverdue ? 'destructive' : 'accent'}>
                {!status.lastReviewedAt ? 'Never reviewed' : isOverdue ? 'Overdue' : 'Up to date'}
              </Badge>
            )}
          </div>
          <span className="text-sm">{isLoading && !status ? 'Loading…' : dueText(status?.nextReviewDue ?? null)}</span>
          {settings && (
            <span className="text-xs text-muted-foreground">
              Reviewed every {settings.reviewIntervalMonths} month
              {settings.reviewIntervalMonths === 1 ? '' : 's'} and after significant changes (ISO
              27001 8.2). Owner acceptance is required from a{' '}
              {LEVEL_LABEL[settings.acceptanceRequiredFromLevel].toLowerCase()} residual level. Both
              come from your{' '}
              <Link
                href={`/${orgId}/documents/isms/risk-methodology`}
                className="underline underline-offset-4"
              >
                Risk Assessment Methodology (6.1.2)
              </Link>
              .
            </span>
          )}
        </div>
        {canRecord && (
          <div className="shrink-0">
            <Button iconLeft={<CheckmarkOutline size={16} />} onClick={() => setRecording(true)}>
              Record review
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-border bg-background p-4 sm:p-6">
        <h3 className="text-base font-medium">Review history</h3>
        {isLoading && reviews.length === 0 ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : reviews.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No reviews yet</EmptyTitle>
              <EmptyDescription>
                Walk through the register with the risk owners, update ratings and treatments, then
                sign off. Each review freezes the register as audit evidence.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Signed off by</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Risks</TableHead>
                <TableHead>High or above</TableHead>
                <TableHead>Open issues</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review) => {
                const totals = review.totals;
                const highOrAbove = totals
                  ? totals.byResidualLevel.high + totals.byResidualLevel['very-high']
                  : null;
                const issues = totals
                  ? totals.awaitingAcceptance + totals.staleAcceptance + totals.overdueActions + totals.withoutOwner
                  : null;
                return (
                  <TableRow
                    key={review.id}
                    onClick={() => setOpenReviewId(review.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="whitespace-nowrap text-sm underline-offset-4 hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenReviewId(review.id);
                        }}
                      >
                        {formatDay(review.createdAt)}
                      </button>
                    </TableCell>
                    <TableCell>{review.reviewedByName}</TableCell>
                    <TableCell>{TRIGGER_LABEL[review.trigger] ?? review.trigger}</TableCell>
                    <TableCell>{totals?.risks ?? '—'}</TableCell>
                    <TableCell>{highOrAbove ?? '—'} residual</TableCell>
                    <TableCell>
                      {issues === null ? '—' : issues === 0 ? (
                        <Badge variant="accent">None</Badge>
                      ) : (
                        <Badge variant="destructive">{issues}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <RecordRiskReviewSheet open={recording} members={members} onOpenChange={setRecording} onRecord={handleRecord} />
      <RiskReviewDetailDialog
        reviewId={openReviewId}
        onOpenChange={(open) => !open && setOpenReviewId(null)}
      />
    </div>
  );
}
