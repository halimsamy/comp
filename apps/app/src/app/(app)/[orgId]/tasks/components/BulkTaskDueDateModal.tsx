'use client';

import {
  Button,
  Calendar,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@trycompai/design-system';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTasks } from '../hooks/useTasks';

/** Bulk "Set due date" (#118): sets or clears Task.reviewDate on the selected tasks. */
export function BulkTaskDueDateModal({
  open,
  onOpenChange,
  selectedTaskIds,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTaskIds: string[];
  onSuccess?: () => void;
}) {
  const { bulkUpdateDueDate } = useTasks();
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const count = selectedTaskIds.length;

  useEffect(() => {
    if (open) setDate(undefined);
  }, [open]);

  const handleSave = async (dueDate: string | null) => {
    setIsSubmitting(true);
    try {
      const { updatedCount } = await bulkUpdateDueDate({ taskIds: selectedTaskIds, dueDate });
      toast.success(
        dueDate
          ? `Due date set on ${updatedCount} task${updatedCount === 1 ? '' : 's'}`
          : `Due date cleared on ${updatedCount} task${updatedCount === 1 ? '' : 's'}`,
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to set the due date');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set due date</DialogTitle>
          <DialogDescription>
            {`Applies to ${count} selected task${count === 1 ? '' : 's'}. Overdue and due-soon counts and the overview deadlines use this date.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <Calendar mode="single" selected={date} onSelect={setDate} captionLayout="dropdown" />
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={isSubmitting} onClick={() => handleSave(null)}>
            Clear due date
          </Button>
          <Button
            disabled={!date || count === 0}
            loading={isSubmitting}
            onClick={() => date && handleSave(format(date, 'yyyy-MM-dd'))}
          >
            {date ? `Set ${format(date, 'MMM d, yyyy')}` : 'Pick a date'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
