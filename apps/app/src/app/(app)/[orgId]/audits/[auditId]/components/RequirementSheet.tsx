'use client';

import type { AuditRequirement, AuditReviewStatus } from '@/hooks/use-audits';
import {
  Badge,
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { Checkmark, DocumentExport, Flag, Renew } from '@trycompai/design-system/icons';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ITEM_STATUS_LABELS, formatDay, itemBadgeVariant, itemStatus } from '../../lib/audit-labels';
import { AuditCommentsThread } from './AuditCommentsThread';
import { RaiseFindingForm } from './RaiseFindingForm';
import { RequirementEvidence } from './RequirementEvidence';

/** Requirement drawer: evidence, the auditor's assessment and the comment thread. */
export function RequirementSheet({
  orgId,
  auditId,
  frameworkName,
  requirement,
  canAssess,
  canRaiseFinding,
  onOpenChange,
  onReview,
}: {
  orgId: string;
  auditId: string;
  frameworkName: string;
  requirement: AuditRequirement | null;
  /** The viewer is one of this audit's auditors. */
  canAssess: boolean;
  /** The viewer has finding:create. */
  canRaiseFinding: boolean;
  onOpenChange: (open: boolean) => void;
  onReview: (input: { status: AuditReviewStatus | null; note?: string }) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<AuditReviewStatus | 'clear' | null>(null);

  useEffect(() => setNote(requirement?.review?.note ?? ''), [requirement]);

  const handleReview = async (status: AuditReviewStatus | null) => {
    setBusy(status ?? 'clear');
    try {
      await onReview({ status, note: note.trim() || undefined });
      toast.success(status ? `Marked ${ITEM_STATUS_LABELS[status].toLowerCase()}` : 'Assessment cleared');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the assessment');
    } finally {
      setBusy(null);
    }
  };

  const status = requirement ? itemStatus(requirement) : null;
  const review = requirement?.review;

  return (
    <Sheet open={requirement !== null} onOpenChange={onOpenChange}>
      <SheetContent>
        {requirement && status ? (
          <>
            <SheetHeader>
              <SheetTitle>
                {requirement.identifier ? `${requirement.identifier} ` : ''}
                {requirement.name}
              </SheetTitle>
              <SheetDescription>
                {requirement.description || 'Evidence collected for this requirement.'}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <Stack gap="6">
                <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={itemBadgeVariant(status)}>{ITEM_STATUS_LABELS[status]}</Badge>
                    {review ? (
                      <Text size="xs" variant="muted">
                        by {review.reviewedBy?.name || review.reviewedBy?.email || 'an auditor'} on{' '}
                        {formatDay(review.reviewedAt)}
                      </Text>
                    ) : null}
                  </div>
                  {review?.note && !canAssess ? (
                    <div className="whitespace-pre-wrap">
                      <Text size="sm">{review.note}</Text>
                    </div>
                  ) : null}
                  {canAssess && status !== 'not_applicable' ? (
                    <Stack gap="2">
                      <Textarea
                        aria-label="Assessment note"
                        placeholder="Note for the team (what is missing or why it is flagged)"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        maxLength={4000}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" iconLeft={<Checkmark size={16} />} loading={busy === 'accepted'} onClick={() => void handleReview('accepted')}>
                          Accept
                        </Button>
                        <Button size="sm" variant="destructive" iconLeft={<Flag size={16} />} loading={busy === 'flagged'} onClick={() => void handleReview('flagged')}>
                          Flag
                        </Button>
                        <Button size="sm" variant="outline" iconLeft={<DocumentExport size={16} />} loading={busy === 'requested'} onClick={() => void handleReview('requested')}>
                          Request more
                        </Button>
                        {review ? (
                          <Button size="sm" variant="ghost" iconLeft={<Renew size={16} />} loading={busy === 'clear'} onClick={() => void handleReview(null)}>
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </Stack>
                  ) : null}
                </div>
                {status === 'flagged' && canRaiseFinding ? (
                  <div className="rounded-md border border-border p-3">
                    <RaiseFindingForm
                      key={requirement.id}
                      orgId={orgId}
                      auditId={auditId}
                      frameworkName={frameworkName}
                      requirement={requirement}
                      defaultContent={review?.note ?? ''}
                    />
                  </div>
                ) : null}
                <RequirementEvidence orgId={orgId} requirement={requirement} />
                <Stack gap="2">
                  <Text size="sm" weight="semibold">
                    Comments
                  </Text>
                  <AuditCommentsThread auditId={auditId} requirementId={requirement.id} />
                </Stack>
              </Stack>
            </SheetBody>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
