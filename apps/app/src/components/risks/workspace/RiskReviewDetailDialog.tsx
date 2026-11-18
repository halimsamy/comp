'use client';

import { useRiskReview, type RiskReviewDetail } from '@/hooks/use-risk-workspace';
import { LEVEL_LABEL } from '@/lib/risk-score';
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { TRIGGER_LABEL } from './RecordRiskReviewSheet';
import { formatDay } from './workspace-types';

type Acceptance = RiskReviewDetail['snapshot']['risks'][number]['acceptance'];

const ACCEPTANCE: Record<Acceptance, { label: string; variant: 'accent' | 'secondary' | 'destructive' | 'outline' }> = {
  accepted: { label: 'Accepted', variant: 'accent' },
  awaiting: { label: 'Awaiting', variant: 'destructive' },
  stale: { label: 'Stale', variant: 'destructive' },
  not_required: { label: 'Not required', variant: 'outline' },
};

/** The register frozen at a review's sign-off (read-only evidence, ISO 27001 8.2). */
export function RiskReviewDetailDialog({
  reviewId,
  onOpenChange,
}: {
  reviewId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { review, error, isLoading } = useRiskReview(reviewId);
  const snapshot = review?.snapshot;

  return (
    <Dialog open={reviewId !== null} onOpenChange={onOpenChange}>
      <DialogContent size="4xl">
        <DialogHeader>
          <DialogTitle>
            Risk review {review ? `of ${formatDay(review.createdAt)}` : ''}
          </DialogTitle>
          <DialogDescription>
            The register as it stood when the review was signed off. Later edits to risks do not
            change it.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          {error ? (
            <Text variant="muted">Couldn&apos;t load this review.</Text>
          ) : isLoading || !review || !snapshot ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Signed off by</dt>
                  <dd>{review.reviewedByName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reason</dt>
                  <dd>{TRIGGER_LABEL[review.trigger] ?? review.trigger}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Acceptance from</dt>
                  <dd>{LEVEL_LABEL[snapshot.acceptanceRequiredFromLevel]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Next review due</dt>
                  <dd>{formatDay(review.nextReviewDue)}</dd>
                </div>
              </dl>
              {review.notes && <p className="whitespace-pre-wrap text-sm">{review.notes}</p>}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk</TableHead>
                    <TableHead>Inherent</TableHead>
                    <TableHead>Residual</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Acceptance</TableHead>
                    <TableHead>Open actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.risks.map((risk) => (
                    <TableRow key={risk.id}>
                      <TableCell>
                        <span className="text-sm">{risk.title}</span>
                      </TableCell>
                      <TableCell>{LEVEL_LABEL[risk.inherentLevel]}</TableCell>
                      <TableCell>{LEVEL_LABEL[risk.residualLevel]}</TableCell>
                      <TableCell>{risk.ownerName ?? 'Unassigned'}</TableCell>
                      <TableCell>
                        <Badge variant={ACCEPTANCE[risk.acceptance].variant}>
                          {ACCEPTANCE[risk.acceptance].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {risk.openActions}
                        {risk.overdueActions > 0 && ` (${risk.overdueActions} overdue)`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
