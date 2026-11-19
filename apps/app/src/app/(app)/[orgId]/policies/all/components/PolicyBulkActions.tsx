'use client';

import { apiClient } from '@/lib/api-client';
import type { Member, User } from '@db';
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
  Text,
} from '@trycompai/design-system';
import { Checkmark, Send, UserAvatar } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { SubmitApprovalDialog } from '../../[policyId]/components/SubmitApprovalDialog';
import { isAwaitingApprovalBy, type PolicyRegisterRow } from '../../lib/policy-register';

type Dialog = 'submit' | 'owner' | 'approve' | null;

interface BulkSubmitResult {
  submitted: number;
  skipped: { policyId: string; name: string; reason: string }[];
}

const plural = (n: number) => `${n} ${n === 1 ? 'policy' : 'policies'}`;

/** Bulk bar for the register: submit for approval, set owner, approve mine. */
export function PolicyBulkActions({
  selected,
  members,
  currentMemberId,
  onDone,
}: {
  selected: PolicyRegisterRow[];
  members: (Member & { user: User })[];
  currentMemberId: string | null;
  onDone: () => void;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const ids = selected.map((policy) => policy.id);
  const canApproveAll =
    selected.length > 0 && selected.every((policy) => isAwaitingApprovalBy(policy, currentMemberId));

  const close = () => {
    setDialog(null);
    setMemberId(null);
  };

  const run = async (action: () => Promise<void>) => {
    setIsWorking(true);
    try {
      await action();
      close();
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsWorking(false);
    }
  };

  const handleSubmit = () =>
    run(async () => {
      const { data, error } = await apiClient.post<BulkSubmitResult>(
        '/v1/policies/bulk/submit-for-approval',
        { policyIds: ids, approverId: memberId },
      );
      if (error || !data) throw new Error(error ?? 'Failed to submit policies');
      toast.success(`${plural(data.submitted)} submitted for approval`);
      if (data.skipped.length > 0) {
        toast.info(
          `Skipped ${plural(data.skipped.length)}: ${data.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}`,
        );
      }
    });

  const handleSetOwner = () =>
    run(async () => {
      const { data, error } = await apiClient.post<{ updated: number }>('/v1/policies/bulk/owner', {
        policyIds: ids,
        ownerId: memberId,
      });
      if (error || !data) throw new Error(error ?? 'Failed to set owner');
      toast.success(`Owner set on ${plural(data.updated)}`);
    });

  // One approval per policy through the app route, which also emails employees.
  const handleApprove = () =>
    run(async () => {
      let approved = 0;
      for (const id of ids) {
        const response = await fetch(`/api/policies/${id}/accept-changes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        if (response.ok) approved++;
      }
      if (approved < ids.length) {
        toast.error(`Approved ${approved} of ${plural(ids.length)}`);
        return;
      }
      toast.success(`${plural(approved)} approved and published`);
    });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <Text size="sm" weight="medium">
        {plural(selected.length)} selected
      </Text>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" iconLeft={<UserAvatar size={14} />} onClick={() => setDialog('owner')}>
          Set owner
        </Button>
        <Button size="sm" variant="outline" iconLeft={<Send size={14} />} onClick={() => setDialog('submit')}>
          Submit {selected.length} for approval
        </Button>
        {canApproveAll && (
          <Button size="sm" iconLeft={<Checkmark size={14} />} onClick={() => setDialog('approve')}>
            Approve selected
          </Button>
        )}
      </div>

      <SubmitApprovalDialog
        isOpen={dialog === 'submit' || dialog === 'owner'}
        onOpenChange={(open) => !open && close()}
        assignees={members}
        selectedApproverId={memberId}
        onSelectedApproverIdChange={setMemberId}
        onConfirm={dialog === 'owner' ? handleSetOwner : handleSubmit}
        isSubmitting={isWorking}
        title={dialog === 'owner' ? `Set owner of ${plural(selected.length)}` : `Submit ${plural(selected.length)} for approval`}
        description={
          dialog === 'owner'
            ? 'The owner is accountable for keeping each policy current and reviewed.'
            : 'Each policy becomes its own approval request. The approver is emailed and notified in the app.'
        }
        confirmText={dialog === 'owner' ? 'Set owner' : 'Submit for approval'}
      />

      <AlertDialog open={dialog === 'approve'} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {plural(selected.length)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Each pending version is published. Employees must acknowledge the new versions again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} loading={isWorking}>
              Approve and publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
