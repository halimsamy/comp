'use client';

import type { Audit, AuditPayload } from '@/hooks/use-audits';
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
import { TrashCan } from '@trycompai/design-system/icons';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { auditSchema, toAuditFormValues, toAuditPayload, type AuditFormValues } from '../lib/audit-schema';
import { AuditFormFields, type Option } from './AuditFormFields';

/** Add or edit an audit engagement. */
export function AuditFormSheet({
  open,
  onOpenChange,
  audit,
  frameworks,
  auditors,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = add a new audit. */
  audit: Audit | null;
  frameworks: Option[];
  auditors: Option[];
  onSubmit: (payload: AuditPayload) => Promise<void>;
  onDelete: (audit: Audit) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const form = useForm<AuditFormValues>({
    resolver: zodResolver(auditSchema),
    defaultValues: toAuditFormValues(audit),
  });

  useEffect(() => {
    if (open) form.reset(toAuditFormValues(audit));
  }, [open, audit, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(toAuditPayload({ values, audit }));
      toast.success(audit ? 'Audit updated' : 'Audit added');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the audit');
    }
  });

  const handleDelete = async () => {
    if (!audit) return;
    setIsDeleting(true);
    try {
      await onDelete(audit);
      toast.success('Audit deleted');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete the audit');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{audit ? 'Edit audit' : 'Add an audit'}</SheetTitle>
          <SheetDescription>
            The audit period sets which evidence is in scope and exported. Auditors with only the
            Auditor role are signed out after their access ends.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="audit-form" onSubmit={(event) => void handleSubmit(event)}>
            <AuditFormFields
              control={form.control}
              isNew={!audit}
              frameworks={frameworks}
              auditors={auditors}
            />
          </form>
        </SheetBody>
        <SheetFooter>
          {audit ? (
            <Button
              type="button"
              variant="destructive"
              iconLeft={<TrashCan size={16} />}
              loading={isDeleting}
              onClick={() => void handleDelete()}
            >
              Delete
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="audit-form" loading={form.formState.isSubmitting}>
            {audit ? 'Save' : 'Add audit'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
