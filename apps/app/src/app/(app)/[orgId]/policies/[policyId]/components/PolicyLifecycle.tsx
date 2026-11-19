'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { usePolicyAcknowledgements, usePolicyReviews } from '@/hooks/use-policy-lifecycle';
import { Badge, Button, Section, Stack, Text } from '@trycompai/design-system';
import { CheckmarkFilled, CircleDash, Renew, Time } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useState } from 'react';
import { getPolicyLifecycle, POLICY_LIFECYCLE_STEPS } from '../lib/policy-lifecycle-state';
import { MarkReviewedDialog } from './MarkReviewedDialog';
import { PolicyReviewHistory } from './PolicyReviewHistory';

type Person = { user: { name: string | null; email?: string | null } } | null | undefined;

export interface PolicyLifecyclePolicy {
  id: string;
  status: string;
  frequency: string | null;
  reviewDate: Date | string | null;
  lastPublishedAt: Date | string | null;
  pendingVersionId: string | null;
  approverId: string | null;
  isArchived: boolean;
  assignee?: Person;
}

export interface PolicyLifecycleVersion {
  version: number;
  approvedAt?: Date | string | null;
  approvalComment?: string | null;
  approvedBy?: Person;
  publishedBy?: Person;
}

const formatDate = (value: Date | string | null | undefined) =>
  value ? format(new Date(value), 'MMM d, yyyy') : '—';
const personName = (person: Person) => person?.user?.name || person?.user?.email || '—';

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <Text size="xs" variant="muted">
        {label}
      </Text>
      <Text size="sm" weight="medium">
        {value}
      </Text>
      {hint && (
        <Text size="xs" variant="muted">
          {hint}
        </Text>
      )}
    </div>
  );
}

export function PolicyLifecycle({
  policy,
  currentVersion,
  onMutate,
}: {
  policy: PolicyLifecyclePolicy;
  currentVersion: PolicyLifecycleVersion | null;
  onMutate?: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const { reviews, recordReview } = usePolicyReviews({ policyId: policy.id });
  const { acknowledgements, mutate: mutateAcknowledgements } = usePolicyAcknowledgements({
    policyId: policy.id,
  });
  const lastReview = reviews[0]?.reviewedAt ?? null;
  const lifecycle = getPolicyLifecycle({ ...policy, lastReviewedAt: lastReview });
  const canRecordReview =
    hasPermission('policy', 'update') &&
    lifecycle.canRecordReview &&
    !policy.isArchived &&
    Boolean(currentVersion);
  const summary = acknowledgements?.summary;

  const handleRecordReview = async (input: {
    notes?: string;
    nextReviewDate: string;
    requireReacknowledgement: boolean;
  }) => {
    await recordReview(input);
    if (input.requireReacknowledgement) await mutateAcknowledgements();
    onMutate?.();
  };

  const reviewHint =
    lifecycle.daysUntilReview === null
      ? undefined
      : lifecycle.daysUntilReview <= 0
        ? 'Overdue'
        : `In ${lifecycle.daysUntilReview} days`;

  return (
    <Section
      title="Lifecycle"
      description="Draft, approve, publish and review this policy at planned intervals."
      actions={
        canRecordReview ? (
          <Button
            size="sm"
            variant={lifecycle.stage === 'review_due' ? 'default' : 'outline'}
            iconLeft={<Renew size={14} />}
            onClick={() => setIsReviewOpen(true)}
          >
            Mark as reviewed
          </Button>
        ) : undefined
      }
    >
      <Stack gap="lg">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Policy lifecycle">
          {POLICY_LIFECYCLE_STEPS.map((step, index) => {
            const isDone = index < lifecycle.stepIndex;
            const isCurrent = index === lifecycle.stepIndex;
            const isWarning = isCurrent && step.stage === 'review_due';
            return (
              <li
                key={step.stage}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                  isWarning
                    ? 'border-destructive/50 bg-destructive/10'
                    : isCurrent
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border'
                }`}
              >
                <span
                  className={
                    isWarning ? 'text-destructive' : isDone || isCurrent ? 'text-primary' : 'text-muted-foreground'
                  }
                >
                  {isDone ? (
                    <CheckmarkFilled size={16} />
                  ) : isCurrent ? (
                    <Time size={16} />
                  ) : (
                    <CircleDash size={16} />
                  )}
                </span>
                <Text size="sm" weight={isCurrent ? 'medium' : 'normal'} variant={isCurrent || isDone ? 'default' : 'muted'}>
                  {step.label}
                </Text>
              </li>
            );
          })}
        </ol>

        {lifecycle.stage === 'review_due' && (
          <Text size="sm" variant="warning">
            This policy is due for its periodic review. If nothing needs to change, mark it as
            reviewed — employees will not have to sign it again.
          </Text>
        )}
        {lifecycle.isReviewDueSoon && (
          <Badge variant="outline">Review due in {lifecycle.daysUntilReview} days</Badge>
        )}

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-6">
          <Fact label="Owner" value={personName(policy.assignee)} />
          <Fact
            label="Current version"
            value={currentVersion ? `v${currentVersion.version}` : 'Not published'}
          />
          <Fact
            label="Approved by"
            value={personName(currentVersion?.approvedBy ?? currentVersion?.publishedBy)}
            hint={currentVersion?.approvedAt ? formatDate(currentVersion.approvedAt) : undefined}
          />
          <Fact label="Effective" value={formatDate(policy.lastPublishedAt)} />
          {/* Until a periodic review exists, the only date we have is the approval. */}
          {lastReview ? (
            <Fact label="Last reviewed" value={formatDate(lastReview)} />
          ) : (
            <Fact
              label="Approved"
              value={formatDate(currentVersion?.approvedAt ?? policy.lastPublishedAt)}
            />
          )}
          <Fact label="Next review" value={formatDate(policy.reviewDate)} hint={reviewHint} />
        </div>

        {currentVersion?.approvalComment && (
          <Text size="sm" variant="muted">
            Approval note: “{currentVersion.approvalComment}”
          </Text>
        )}

        {summary && summary.total > 0 && (
          <Text size="sm" variant="muted">
            {summary.acknowledged} of {summary.total} employees acknowledged the current version.
          </Text>
        )}

        <PolicyReviewHistory reviews={reviews} />
      </Stack>

      <MarkReviewedDialog
        open={isReviewOpen}
        onOpenChange={setIsReviewOpen}
        frequency={policy.frequency}
        versionLabel={currentVersion ? `version ${currentVersion.version}` : 'this policy'}
        lastReviewedAt={lastReview}
        onSubmit={handleRecordReview}
      />
    </Section>
  );
}
