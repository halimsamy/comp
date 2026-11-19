'use client';

import {
  useAccessMutations,
  useAccessReview,
  type AccessDecision,
  type AccessReviewItem,
} from '@/hooks/use-access-reviews';
import { usePermissions } from '@/hooks/use-permissions';
import { Button, PageHeader, PageLayout, Spinner, Text } from '@trycompai/design-system';
import { Checkmark, DocumentPdf, TrashCan } from '@trycompai/design-system/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DECISION_LABEL, filterByFlag, matchesSearch, type AccountFilter } from '../lib/access-labels';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { NoteDialog, type NoteRequest } from './NoteDialog';
import { RemediateDialog } from './RemediateDialog';
import { ReviewFilters, type DecisionFilter } from './ReviewFilters';
import { ReviewItemsTable } from './ReviewItemsTable';
import { ReviewSummary } from './ReviewSummary';

const errorMessage = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

/** One access review: flags, keep/revoke/modify decisions, remediation and sign-off. */
export function AccessReviewDetail({ orgId, reviewId }: { orgId: string; reviewId: string }) {
  const router = useRouter();
  const { review, isLoading, error, mutate } = useAccessReview(reviewId);
  const mutations = useAccessMutations();
  const { hasPermission } = usePermissions();
  const editable = hasPermission('member', 'update') && review?.status === 'in_progress';
  const [systemId, setSystemId] = useState('all');
  const [flag, setFlag] = useState<AccountFilter>('all');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [noteRequest, setNoteRequest] = useState<NoteRequest | null>(null);
  const [remediating, setRemediating] = useState<AccessReviewItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const systemNames = useMemo(() => new Map(review?.systems.map((s) => [s.id, s.systemName]) ?? []), [review]);
  const visible = useMemo(() => {
    const items = review?.items ?? [];
    return filterByFlag({ rows: items, filter: flag }).filter(
      (item) =>
        (systemId === 'all' || item.reviewSystemId === systemId) &&
        (decisionFilter === 'all' || (decisionFilter === 'pending') === (item.decision === null)) &&
        matchesSearch({ values: [item.accountName, item.email, item.ownerName], query: search }),
    );
  }, [review, flag, systemId, decisionFilter, search]);

  const decide = async ({ itemIds, decision, comment }: { itemIds: string[]; decision: AccessDecision; comment?: string }) => {
    try {
      const result = await mutations.decide({ reviewId, itemIds, decision, comment: comment || undefined });
      if (result.skipped > 0) toast.info(`${result.skipped} already decided accounts were left as they were`);
      setSelected(new Set());
      await mutate();
    } catch (caught) {
      toast.error(errorMessage(caught, 'Failed to save the decision'));
      throw caught;
    }
  };

  const handleDecide = (itemIds: string[], decision: AccessDecision) => {
    const items = (review?.items ?? []).filter((i) => itemIds.includes(i.id));
    // #79: bulk decisions only touch undecided rows; keeping a flagged account needs a justification.
    const targets = items.length > 1 ? items.filter((i) => i.decision === null) : items;
    const count = targets.length === 1 ? 'this account' : `${targets.length} accounts`;
    const flagged = targets.some((i) => i.flags.length > 0);
    if (decision === 'keep' && !flagged) {
      void decide({ itemIds, decision }).catch(() => undefined);
      return;
    }
    setNoteRequest({
      title: `${DECISION_LABEL[decision]} access`,
      description:
        decision === 'keep'
          ? `${count === 'this account' ? 'This account is' : 'Some of these accounts are'} flagged. Explain why the access is still needed.`
          : decision === 'revoke'
            ? `Remove ${count} from the system, then mark the change done.`
            : `Describe how the access of ${count} should change, then mark it done once applied.`,
      label: decision === 'revoke' ? 'Reason (optional)' : decision === 'keep' ? 'Justification' : 'Change needed',
      placeholder:
        decision === 'revoke'
          ? 'Left the company in October'
          : decision === 'keep'
            ? 'Break-glass admin, used only during incidents'
            : 'Downgrade from admin to member',
      confirmLabel: DECISION_LABEL[decision],
      required: decision !== 'revoke',
      onConfirm: (comment) => decide({ itemIds, decision, comment }),
    });
  };

  const handleRemediate = async (input: { note?: string; url?: string; file?: File }) => {
    if (!remediating) return;
    try {
      await mutations.remediate({ reviewId, itemId: remediating.id, ...input });
      await mutate();
    } catch (caught) {
      toast.error(errorMessage(caught, 'Failed to mark the change as done'));
      throw caught;
    }
  };

  const handleSignOff = () =>
    setNoteRequest({
      title: 'Sign off the review',
      description:
        'As management, you confirm that the access in this review remains appropriate for each job function and that every change was made (PCI DSS 7.2.4, 7.2.5.1). The PDF report is attached to the Access Review Log task.',
      label: 'Sign-off note (optional)',
      confirmLabel: 'Sign off',
      required: false,
      onConfirm: async (note) => {
        try {
          await mutations.signOff({ reviewId, note: note || undefined });
          await mutate();
          toast.success('Review signed off');
        } catch (caught) {
          toast.error(errorMessage(caught, 'Failed to sign off'));
          throw caught;
        }
      },
    });

  const handleDownload = async () => {
    if (!review) return;
    try {
      await mutations.downloadReport({ reviewId, name: review.name });
    } catch (caught) {
      toast.error(errorMessage(caught, 'Failed to generate the report'));
    }
  };

  const handleDelete = async () => {
    try {
      await mutations.deleteReview(reviewId);
      router.push(`/${orgId}/people?tab=access`);
    } catch (caught) {
      toast.error(errorMessage(caught, 'Failed to delete the review'));
    }
  };

  const handleToggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ready = review && review.progress.decided === review.progress.total && review.progress.pendingRemediation === 0;

  return (
    <PageLayout
      header={
        <PageHeader
          title={review?.name ?? 'Access review'}
          backHref={`/${orgId}/people?tab=access`}
          backLabel="Access"
          actions={
            review && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" iconLeft={<DocumentPdf size={16} />} onClick={() => void handleDownload()}>
                  Report
                </Button>
                {editable && (
                  <>
                    <Button variant="outline" iconLeft={<TrashCan size={16} />} onClick={() => setConfirmDelete(true)}>
                      Delete
                    </Button>
                    <Button iconLeft={<Checkmark size={16} />} onClick={handleSignOff} disabled={!ready}>
                      Sign off
                    </Button>
                  </>
                )}
              </div>
            )
          }
        />
      }
    >
      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-6">
          <Text variant="muted">Couldn&apos;t load this access review.</Text>
          <Button size="sm" variant="outline" onClick={() => void mutate()}>
            Retry
          </Button>
        </div>
      ) : !review ? (
        <div className="flex justify-center py-10">{isLoading && <Spinner />}</div>
      ) : (
        <div className="flex flex-col gap-6">
          <ReviewSummary review={review} />
          <ReviewFilters
            review={review}
            systemNames={systemNames}
            systemId={systemId}
            decisionFilter={decisionFilter}
            search={search}
            flag={flag}
            onSystemChange={setSystemId}
            onDecisionChange={setDecisionFilter}
            onSearchChange={setSearch}
            onFlagChange={setFlag}
          />
          {editable && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
              <Text size="sm">{selected.size} selected</Text>
              {(['keep', 'revoke', 'modify'] as const).map((decision) => (
                <Button key={decision} size="sm" variant="outline" onClick={() => handleDecide([...selected], decision)}>
                  {bulkLabel({ decision, items: review.items, selected })}
                </Button>
              ))}
            </div>
          )}
          {visible.length === 0 ? (
            <Text variant="muted">No accounts match these filters.</Text>
          ) : (
            <ReviewItemsTable
              items={visible}
              systemNames={systemNames}
              editable={editable}
              selected={selected}
              onToggle={handleToggle}
              onToggleAll={(checked) => setSelected(checked ? new Set(visible.map((i) => i.id)) : new Set())}
              onDecide={(item, decision) => handleDecide([item.id], decision)}
              onRemediate={setRemediating}
            />
          )}
        </div>
      )}
      <NoteDialog request={noteRequest} onOpenChange={(open) => !open && setNoteRequest(null)} />
      <RemediateDialog
        item={remediating}
        onOpenChange={(open) => !open && setRemediating(null)}
        onConfirm={handleRemediate}
      />
      <ConfirmDeleteDialog
        open={confirmDelete}
        title="Delete this access review?"
        description="Decisions made so far are lost."
        onOpenChange={setConfirmDelete}
        onConfirm={handleDelete}
      />
    </PageLayout>
  );
}

/** "Keep 12 undecided (3 skipped)": bulk actions never overwrite earlier decisions. */
function bulkLabel({
  decision,
  items,
  selected,
}: {
  decision: AccessDecision;
  items: AccessReviewItem[];
  selected: Set<string>;
}) {
  const chosen = items.filter((i) => selected.has(i.id));
  const label = DECISION_LABEL[decision];
  if (chosen.length < 2) return label;
  const undecided = chosen.filter((i) => i.decision === null).length;
  const skipped = chosen.length - undecided;
  return skipped > 0 ? `${label} ${undecided} undecided (${skipped} skipped)` : `${label} ${undecided}`;
}
