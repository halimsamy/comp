'use client';

import {
  getPolicyAcknowledgmentCount,
  PolicyAcknowledgmentInvalidationDialog,
} from '@/components/policies/PolicyAcknowledgmentInvalidationDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { authClient } from '@/utils/auth-client';
import type { Member, Policy, User } from '@db';
import {
  ApprovalBanner,
  Button,
  HStack,
  Label,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { Archive, Renew, Time } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePolicy } from '../hooks/usePolicy';
import type { PolicyVersionWithPublisher } from '../hooks/usePolicyVersions';

/** The latest rejection that is still unresolved (nothing pending or published since). */
export function findOpenRejection({
  policy,
  versions,
}: {
  policy: Pick<Policy, 'pendingVersionId' | 'lastPublishedAt'>;
  versions: PolicyVersionWithPublisher[];
}) {
  if (policy.pendingVersionId) return null;
  const latest = versions
    .filter((v) => v.rejectedAt)
    .sort((a, b) => new Date(b.rejectedAt ?? 0).getTime() - new Date(a.rejectedAt ?? 0).getTime())[0];
  if (!latest?.rejectedAt) return null;
  if (policy.lastPublishedAt && new Date(policy.lastPublishedAt) > new Date(latest.rejectedAt)) {
    return null;
  }
  return latest;
}

interface PolicyAlertsProps {
  policy: (Policy & { approver: (Member & { user: User }) | null }) | null;
  versions?: PolicyVersionWithPublisher[];
  isPendingApproval: boolean;
  onMutate?: () => void;
}

export function PolicyAlerts({
  policy,
  versions = [],
  isPendingApproval,
  onMutate,
}: PolicyAlertsProps) {
  const { data: activeMember } = authClient.useActiveMember();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgId, policyId } = useParams<{ orgId: string; policyId: string }>();
  const { hasPermission } = usePermissions();
  const canCurrentUserApprove = policy?.approverId === activeMember?.id;
  const canUpdate = hasPermission('policy', 'update');
  const [isApproving, setIsApproving] = useState(false);
  const [isDenying, setIsDenying] = useState(false);
  const [isInvalidationDialogOpen, setIsInvalidationDialogOpen] = useState(false);
  const [pendingApproveComment, setPendingApproveComment] = useState<string | undefined>();

  const { acceptChanges, denyChanges } = usePolicy({
    policyId,
    organizationId: orgId,
  });

  const approveCommentRef = useRef<HTMLTextAreaElement>(null);
  const rejectCommentRef = useRef<HTMLTextAreaElement>(null);

  const handleApprove = async (comment?: string) => {
    if (policy?.id && policy.approverId) {
      setIsApproving(true);
      try {
        await acceptChanges({ comment });
        toast.success('Policy changes accepted and published!');
        setIsInvalidationDialogOpen(false);
        setPendingApproveComment(undefined);
        onMutate?.();
      } catch {
        toast.error('Failed to accept policy changes.');
      } finally {
        setIsApproving(false);
      }
    }
  };

  const handleApproveRequest = () => {
    const comment = approveCommentRef.current?.value?.trim() || undefined;
    const invalidationCount = getPolicyAcknowledgmentCount(policy);

    if (invalidationCount === 0) {
      void handleApprove(comment);
      return;
    }

    setPendingApproveComment(comment);
    setIsInvalidationDialogOpen(true);
  };

  const handleDeny = async () => {
    if (policy?.id && policy.approverId) {
      const comment = rejectCommentRef.current?.value?.trim() || undefined;
      setIsDenying(true);
      try {
        await denyChanges({ comment });
        toast.info('Policy changes rejected. The author has been notified.');
        onMutate?.();
      } catch {
        toast.error('Failed to deny policy changes.');
      } finally {
        setIsDenying(false);
      }
    }
  };

  const handleOpenArchiveSheet = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('archive-policy-sheet', 'true');
    router.push(`?${params.toString()}`);
  };

  if (!policy) {
    return null;
  }

  const showPendingAlert = isPendingApproval && Boolean(policy.pendingVersionId);
  const showArchivedAlert = policy.isArchived;
  const rejection = findOpenRejection({ policy, versions });

  if (!showPendingAlert && !showArchivedAlert && !rejection) {
    return null;
  }

  const approverName = `${policy?.approver?.user?.name} (${policy?.approver?.user?.email})`;

  return (
    <Stack gap="md">
      {showPendingAlert && canCurrentUserApprove && (
        <ApprovalBanner
          variant="warning"
          title="Your approval is required"
          description="Review this policy and approve or reject the pending changes."
          onApprove={handleApproveRequest}
          onReject={handleDeny}
          approveLoading={isApproving}
          rejectLoading={isDenying}
          approveConfirmation={{
            title: 'Approve Policy Changes',
            description: 'Are you sure you want to approve these policy changes?',
            content: (
              <Stack gap="2">
                <Label htmlFor="approve-comment">Reason (optional)</Label>
                <Textarea
                  ref={approveCommentRef}
                  id="approve-comment"
                  size="full"
                  placeholder="Add an optional comment explaining your decision..."
                />
              </Stack>
            ),
            confirmText: 'Approve',
            cancelText: 'Cancel',
          }}
          rejectConfirmation={{
            title: 'Reject Policy Changes',
            description: 'The author is emailed your reason and the previous version stays in force.',
            content: (
              <Stack gap="2">
                <Label htmlFor="reject-comment">Reason (optional)</Label>
                <Textarea
                  ref={rejectCommentRef}
                  id="reject-comment"
                  size="full"
                  placeholder="Add an optional comment explaining your decision..."
                />
              </Stack>
            ),
            confirmText: 'Reject',
            cancelText: 'Cancel',
          }}
        />
      )}

      {showPendingAlert && canCurrentUserApprove && (
        <PolicyAcknowledgmentInvalidationDialog
          acknowledgmentCount={getPolicyAcknowledgmentCount(policy)}
          isLoading={isApproving}
          onConfirm={() => void handleApprove(pendingApproveComment)}
          onOpenChange={(open) => {
            setIsInvalidationDialogOpen(open);
            if (!open) {
              setPendingApproveComment(undefined);
            }
          }}
          open={isInvalidationDialogOpen}
        />
      )}

      {showPendingAlert && !canCurrentUserApprove && (
        <div className="rounded-lg border border-l-4 border-border border-l-muted-foreground/50 bg-background p-4">
          <HStack gap="3" align="start">
            <Text as="span" variant="muted">
              <Time size={20} />
            </Text>
            <Stack gap="1">
              <Text size="sm" weight="medium" leading="tight">
                Pending approval
              </Text>
              <Text size="sm" variant="muted">
                Waiting for {approverName} to review and approve this policy.
              </Text>
            </Stack>
          </HStack>
        </div>
      )}

      {rejection && (
        <div className="rounded-lg border border-l-4 border-border border-l-destructive bg-background p-4">
          <Stack gap="1">
            <Text size="sm" weight="medium" leading="tight">
              Version {rejection.version} was rejected
            </Text>
            <Text size="sm" variant="muted">
              {rejection.rejectedBy?.user?.name ?? 'The approver'} rejected it on{' '}
              {format(new Date(rejection.rejectedAt ?? new Date()), 'PPP')}
              {rejection.rejectionComment ? `: “${rejection.rejectionComment}”` : '.'} Edit the
              version and submit it again.
            </Text>
          </Stack>
        </div>
      )}

      {showArchivedAlert && (
        <div className="rounded-lg border border-l-4 border-border border-l-muted-foreground/50 bg-background p-4">
          <HStack gap="3" align="center" justify="between">
            <HStack gap="3" align="start">
              <Text as="span" variant="muted">
                <Archive size={20} />
              </Text>
              <Stack gap="1">
                <Text size="sm" weight="medium" leading="tight">
                  This policy is archived
                </Text>
                <Text size="sm" variant="muted">
                  Archived on {format(new Date(policy?.updatedAt ?? new Date()), 'PPP')}
                </Text>
              </Stack>
            </HStack>
            {canUpdate && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenArchiveSheet}
                iconLeft={<Renew size={12} />}
              >
                Restore
              </Button>
            )}
          </HStack>
        </div>
      )}
    </Stack>
  );
}
