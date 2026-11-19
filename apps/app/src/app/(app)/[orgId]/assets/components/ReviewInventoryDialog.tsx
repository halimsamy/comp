'use client';

import type { Asset } from '@/hooks/use-assets';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Stack,
  Text,
} from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Confirms the periodic inventory review (PCI DSS 12.5.1) and the annual
 * scope confirmation (12.5.2). Gaps are shown first so nobody signs off blind.
 */
export function ReviewInventoryDialog({
  open,
  onOpenChange,
  assets,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: Asset[];
  onConfirm: () => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const unassessed = assets.filter((a) => a.cdeScope === 'unassessed').length;
  const unowned = assets.filter((a) => !a.ownerId).length;

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onConfirm();
      toast.success('Inventory review recorded');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record the review');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark inventory reviewed</DialogTitle>
          <DialogDescription>
            Confirm that the {assets.length} assets listed are complete and current, and that their
            PCI DSS scope is right. This records you as reviewer for the inventory review (PCI DSS
            12.5.1, ISO 27001 A.5.9) and the annual scope confirmation (12.5.2).
          </DialogDescription>
        </DialogHeader>
        {unassessed + unowned > 0 ? (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <Stack gap="1">
              {unassessed > 0 ? (
                <Text size="sm">{unassessed} assets have no PCI scope decision yet.</Text>
              ) : null}
              {unowned > 0 ? <Text size="sm">{unowned} assets have no owner.</Text> : null}
              <Text size="xs" variant="muted">
                You can still confirm; an auditor will ask about these.
              </Text>
            </Stack>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={isSaving} onClick={() => void handleConfirm()}>
            Confirm review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
