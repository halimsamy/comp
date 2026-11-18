'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@trycompai/design-system';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { IsmsNonconformityRow, NonconformityPayload } from '../hooks/useNonconformities';
import type { ApproverOption } from './IsmsApprovalSection';
import { NonconformityFields } from './NonconformityFields';
import {
  nonconformitySchema,
  toFormValues,
  toPayload,
  type NonconformityFormValues,
} from './nonconformity-schema';

interface NonconformitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = log a new nonconformity. */
  row: IsmsNonconformityRow | null;
  memberOptions: ApproverOption[];
  canEdit: boolean;
  onSubmit: (payload: NonconformityPayload) => Promise<void>;
}

export function NonconformitySheet({
  open,
  onOpenChange,
  row,
  memberOptions,
  canEdit,
  onSubmit,
}: NonconformitySheetProps) {
  const form = useForm<NonconformityFormValues>({
    resolver: zodResolver(nonconformitySchema),
    defaultValues: toFormValues(row),
  });

  useEffect(() => {
    if (open) form.reset(toFormValues(row));
  }, [open, row, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    const payload = toPayload(values);
    // On edit send only what changed, so an untouched owner who has since left
    // the organization doesn't fail the save.
    const dirty: Record<string, unknown> = form.formState.dirtyFields;
    const changes = row
      ? Object.fromEntries(Object.entries(payload).filter(([key]) => dirty[key]))
      : payload;
    if (row && Object.keys(changes).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await onSubmit(changes);
      toast.success(row ? 'Nonconformity updated' : 'Nonconformity logged');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save nonconformity');
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{row ? row.reference : 'Log a nonconformity'}</SheetTitle>
          <SheetDescription>
            ISO 27001 10.2: react to the nonconformity, find its cause, correct it and review
            whether the action worked.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="nonconformity-form" onSubmit={(event) => void handleSubmit(event)}>
            <fieldset disabled={!canEdit} className="min-w-0">
              <NonconformityFields
                control={form.control}
                memberOptions={memberOptions}
                isAuditFinding={row?.kind === 'audit_finding'}
              />
            </fieldset>
          </form>
        </SheetBody>
        {canEdit ? (
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="nonconformity-form" loading={form.formState.isSubmitting}>
              {row ? 'Save' : 'Log nonconformity'}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
