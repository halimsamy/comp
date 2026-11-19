'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  HStack,
  Stack,
  Text,
} from '@trycompai/design-system';
import { CheckmarkOutline, Close, SubtractAlt, Time } from '@trycompai/design-system/icons';
import { useState } from 'react';

type ApproverMember = { user: { name: string | null; email: string } } | null | undefined;

export function NotRelevantBanner({ justification }: { justification: string }) {
  return (
    <div className="rounded-lg border border-l-4 border-border border-l-muted-foreground/50 bg-muted/30 p-4">
      <HStack gap="sm" align="start">
        <SubtractAlt size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
        <Stack gap="xs">
          <Text size="sm" weight="medium">
            Marked as Not Relevant
          </Text>
          <Text size="sm" variant="muted">
            {justification}
          </Text>
        </Stack>
      </HStack>
    </div>
  );
}

/**
 * The open review request. `isAutoEvidence` is the native variant (#42): Comp AI
 * attached a snapshot from platform records and routed it to the approver.
 * Withdrawing (#44) is its own action, not a rejection: it asks first and keeps
 * the approver.
 */
export function ApprovalBanner({
  canApprove,
  canWithdraw,
  approverMember,
  isAutoEvidence,
  onApprove,
  onReject,
  onWithdraw,
}: {
  canApprove: boolean;
  canWithdraw: boolean;
  approverMember: ApproverMember;
  isAutoEvidence: boolean;
  onApprove: () => void;
  onReject: () => void;
  onWithdraw: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const source = isAutoEvidence ? 'An auto-evidence snapshot from platform records' : 'The evidence';

  if (canApprove) {
    return (
      <div className="rounded-lg border border-l-4 border-border border-l-orange-400 bg-orange-50 p-4 dark:bg-orange-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <HStack gap="sm" align="start">
            <CheckmarkOutline size={20} className="mt-0.5 shrink-0 text-orange-500" />
            <Stack gap="none">
              <Text size="sm" weight="medium">
                Your approval is required
              </Text>
              <Text size="xs" variant="muted">
                {`${source} is attached. Review it, then approve or reject.`}
              </Text>
            </Stack>
          </HStack>
          <HStack gap="sm">
            <Button variant="outline" size="sm" iconLeft={<Close size={16} />} onClick={onReject}>
              Reject
            </Button>
            <Button size="sm" iconLeft={<CheckmarkOutline size={16} />} onClick={onApprove}>
              Approve
            </Button>
          </HStack>
        </div>
      </div>
    );
  }

  const approverName = approverMember ? approverMember.user.name || approverMember.user.email : 'the approver';
  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      await onWithdraw();
      setConfirmOpen(false);
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="rounded-lg border border-l-4 border-border border-l-muted-foreground/50 bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <HStack gap="sm" align="start">
          <Time size={20} className="mt-0.5 shrink-0 text-muted-foreground" />
          <Stack gap="none">
            <Text size="sm" weight="medium">
              {isAutoEvidence ? 'Auto-evidence pending approval' : 'Pending approval'}
            </Text>
            <Text size="xs" variant="muted">
              {isAutoEvidence
                ? `Comp AI attached a snapshot from platform records and asked ${approverName} to review it.`
                : `Waiting for ${approverName} to review.`}
            </Text>
          </Stack>
        </HStack>
        {canWithdraw && (
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
            Withdraw request
          </Button>
        )}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw the review request?</AlertDialogTitle>
            <AlertDialogDescription>
              {`The task goes back to its previous status. ${approverName} stays the approver for the next request, and the activity log records a withdrawal, not a rejection.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWithdrawing}>Keep request</AlertDialogCancel>
            <AlertDialogAction disabled={isWithdrawing} onClick={handleWithdraw}>
              {isWithdrawing ? 'Withdrawing…' : 'Withdraw request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
