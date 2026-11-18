'use client';

import {
  useAccessMutations,
  useAccessReview,
  type AccessDecision,
  type AccessReviewItem,
} from '@/hooks/use-access-reviews';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Button,
  Input,
  PageHeader,
  PageLayout,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Text,
} from '@trycompai/design-system';
import { Checkmark, DocumentPdf, TrashCan } from '@trycompai/design-system/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ACCOUNT_FILTERS, DECISION_LABEL, filterByFlag, matchesSearch, type AccountFilter } from '../lib/access-labels';
import { NoteDialog, type NoteRequest } from './NoteDialog';
import { ReviewItemsTable } from './ReviewItemsTable';
import { ReviewSummary } from './ReviewSummary';

const DECISION_FILTERS = [
  { value: 'all', label: 'All decisions' },
  { value: 'pending', label: 'Pending' },
  { value: 'decided', label: 'Decided' },
] as const;

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
  const [decisionFilter, setDecisionFilter] = useState<(typeof DECISION_FILTERS)[number]['value']>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [noteRequest, setNoteRequest] = useState<NoteRequest | null>(null);

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
      await mutations.decide({ reviewId, itemIds, decision, comment: comment || undefined });
      setSelected(new Set());
      await mutate();
    } catch (caught) {
      toast.error(errorMessage(caught, 'Failed to save the decision'));
      throw caught;
    }
  };

  const handleDecide = (itemIds: string[], decision: AccessDecision) => {
    if (decision === 'keep') {
      void decide({ itemIds, decision }).catch(() => undefined);
      return;
    }
    const count = itemIds.length === 1 ? 'this account' : `${itemIds.length} accounts`;
    setNoteRequest({
      title: `${DECISION_LABEL[decision]} access`,
      description:
        decision === 'revoke'
          ? `Remove ${count} from the system, then mark the change done.`
          : `Describe how the access of ${count} should change, then mark it done once applied.`,
      label: decision === 'revoke' ? 'Reason (optional)' : 'Change needed',
      placeholder: decision === 'revoke' ? 'Left the company in October' : 'Downgrade from admin to member',
      confirmLabel: DECISION_LABEL[decision],
      required: decision === 'modify',
      onConfirm: (comment) => decide({ itemIds, decision, comment }),
    });
  };

  const handleRemediate = (item: AccessReviewItem) =>
    setNoteRequest({
      title: 'Mark the change as done',
      description: `Confirm that the ${item.decision} of ${item.accountName} was applied in the system.`,
      label: 'Note (optional)',
      placeholder: 'Ticket link or what was changed',
      confirmLabel: 'Mark done',
      required: false,
      onConfirm: async (note) => {
        try {
          await mutations.remediate({ reviewId, itemId: item.id, note: note || undefined });
          await mutate();
        } catch (caught) {
          toast.error(errorMessage(caught, 'Failed to mark the change as done'));
          throw caught;
        }
      },
    });

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
    if (!window.confirm('Delete this access review? Decisions made so far are lost.')) return;
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
                    <Button variant="outline" iconLeft={<TrashCan size={16} />} onClick={() => void handleDelete()}>
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
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="w-full sm:w-[220px]">
              <Select value={systemId} onValueChange={(value) => setSystemId(value ?? 'all')}>
                <SelectTrigger aria-label="System">
                  <SelectValue>{(value: string) => (value === 'all' ? 'All systems' : systemNames.get(value))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All systems</SelectItem>
                  {review.systems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.systemName}
                      {s.reviewerName ? ` · ${s.reviewerName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[180px]">
              <Select value={decisionFilter} onValueChange={(value) => setDecisionFilter(value ?? 'all')}>
                <SelectTrigger aria-label="Decision">
                  <SelectValue>{(value: string) => DECISION_FILTERS.find((f) => f.value === value)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DECISION_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[220px]">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accounts" aria-label="Search accounts" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by flag">
            {ACCOUNT_FILTERS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={flag === option.value ? 'default' : 'outline'}
                aria-pressed={flag === option.value}
                onClick={() => setFlag(option.value)}
              >
                {option.label} · {filterByFlag({ rows: review.items, filter: option.value }).length}
              </Button>
            ))}
          </div>
          {editable && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
              <Text size="sm">{selected.size} selected</Text>
              {(['keep', 'revoke', 'modify'] as const).map((decision) => (
                <Button key={decision} size="sm" variant="outline" onClick={() => handleDecide([...selected], decision)}>
                  {DECISION_LABEL[decision]}
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
              onRemediate={handleRemediate}
            />
          )}
        </div>
      )}
      <NoteDialog request={noteRequest} onOpenChange={(open) => !open && setNoteRequest(null)} />
    </PageLayout>
  );
}
