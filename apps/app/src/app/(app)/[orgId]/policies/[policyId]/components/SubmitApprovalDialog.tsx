'use client';

import { SelectAssignee } from '@/components/SelectAssignee';
import type { Member, User } from '@db';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@trycompai/design-system';

interface SubmitApprovalDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  assignees: (Member & { user: User })[];
  selectedApproverId: string | null;
  onSelectedApproverIdChange: (id: string | null) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
}

export const SubmitApprovalDialog = ({
  isOpen,
  onOpenChange,
  assignees,
  selectedApproverId,
  onSelectedApproverIdChange,
  onConfirm,
  isSubmitting,
  title = 'Submit for Approval',
  description = 'Please select an approver for this policy.',
  confirmText = 'Confirm & Submit',
}: SubmitApprovalDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <SelectAssignee
          assignees={assignees}
          assigneeId={selectedApproverId}
          onAssigneeChange={onSelectedApproverIdChange}
          withTitle={false}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting || !selectedApproverId}
            loading={isSubmitting}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
