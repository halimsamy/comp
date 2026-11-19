'use client';

import { useVendorRegisterActions } from '@/hooks/use-vendor-register';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  HStack,
  Label,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { Archive } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatDate } from '../../lib/vendor-tpsp';

/** Banner on an archived vendor, with Restore for editors. */
export function VendorArchivedBanner({
  vendorId,
  archivedAt,
  archiveReason,
  canUpdate,
  onChange,
}: {
  vendorId: string;
  archivedAt: string;
  archiveReason?: string | null;
  canUpdate: boolean;
  onChange: () => void;
}) {
  const { unarchiveVendor } = useVendorRegisterActions();
  const [busy, setBusy] = useState(false);

  const handleRestore = async () => {
    setBusy(true);
    try {
      await unarchiveVendor(vendorId);
      onChange();
      toast.success('Vendor restored to the current register');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to restore the vendor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Archive size={16} /> Archived on {formatDate(archivedAt)}
        </span>
        <span className="text-muted-foreground">
          {archiveReason || 'No reason recorded.'} Archived vendors are kept for audits but leave
          the register, reminders and the trust portal.
        </span>
      </div>
      {canUpdate && (
        <div className="shrink-0">
          <Button variant="outline" size="sm" loading={busy} onClick={() => void handleRestore()}>
            Restore
          </Button>
        </div>
      )}
    </div>
  );
}

/** Settings-tab row: archive a vendor whose relationship ended (ISO 27001 A.5.19 exit). */
export function ArchiveVendorSetting({
  vendorId,
  vendorName,
  onChange,
}: {
  vendorId: string;
  vendorName: string;
  onChange: () => void;
}) {
  const { archiveVendor } = useVendorRegisterActions();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const handleArchive = async () => {
    setBusy(true);
    try {
      await archiveVendor(vendorId, reason.trim());
      setOpen(false);
      onChange();
      toast.success(`${vendorName} archived`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to archive the vendor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <HStack justify="between" align="center">
        <Stack gap="none">
          <Text size="sm" weight="medium">Archive vendor</Text>
          <Text size="xs" variant="muted">
            The relationship ended. Keeps reviews and documents for audits; stops reminders.
          </Text>
        </Stack>
        <Button variant="outline" size="sm" iconLeft={<Archive size={14} />} onClick={() => setOpen(true)}>
          Archive
        </Button>
      </HStack>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {vendorName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm access is revoked and data returned or deleted first. You can restore it
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="archive-reason">Reason (optional)</Label>
            <Textarea
              id="archive-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Contract ended 2026-10-31; data deletion certificate received"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" loading={busy} onClick={() => void handleArchive()}>
              Archive vendor
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
