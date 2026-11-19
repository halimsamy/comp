'use client';

import type { Asset, AssetPayload } from '@/hooks/use-assets';
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
  Stack,
  Text,
} from '@trycompai/design-system';
import { TrashCan } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { SOURCE_LABELS } from '../lib/asset-labels';
import {
  assetSchema,
  toAssetFormValues,
  toAssetPayload,
  type AssetFormValues,
} from '../lib/asset-schema';
import { AssetFormFields, type MemberOption } from './AssetFormFields';

interface AssetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = add a manual asset. */
  asset: Asset | null;
  memberOptions: MemberOption[];
  vendorOptions: MemberOption[];
  canEdit: boolean;
  canDelete: boolean;
  onSubmit: (payload: AssetPayload) => Promise<void>;
  onDelete: (asset: Asset) => Promise<void>;
}

const formatDate = (value: string) => format(new Date(value), 'MMM d, yyyy');

export function AssetSheet({
  open,
  onOpenChange,
  asset,
  memberOptions,
  vendorOptions,
  canEdit,
  canDelete,
  onSubmit,
  onDelete,
}: AssetSheetProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: toAssetFormValues(asset),
  });
  const isSynced = !!asset && asset.source !== 'manual';

  useEffect(() => {
    if (open) form.reset(toAssetFormValues(asset));
  }, [open, asset, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(toAssetPayload({ values, asset }));
      toast.success(asset ? 'Asset updated' : 'Asset added');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save asset');
    }
  });

  const handleDelete = async () => {
    if (!asset) return;
    setIsDeleting(true);
    try {
      await onDelete(asset);
      toast.success('Asset removed');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove asset');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{asset ? asset.name : 'Add an asset'}</SheetTitle>
          <SheetDescription>
            {asset
              ? 'Record who owns this asset, where it runs and whether it is in PCI DSS scope.'
              : 'Add something no integration reports, such as an office network, on-prem server or SaaS app.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Stack gap="4">
            {asset ? (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <Stack gap="1">
                  <Text size="xs" variant="muted">
                    {SOURCE_LABELS[asset.source]}
                    {asset.providerSlug ? ` · ${asset.providerSlug}` : ''}
                  </Text>
                  {isSynced ? (
                    <div className="break-all">
                      <Text size="xs" font="mono">
                        {asset.externalId}
                      </Text>
                    </div>
                  ) : null}
                  <Text size="xs" variant="muted">
                    First seen {formatDate(asset.firstSeenAt)}
                    {isSynced ? ` · last seen ${formatDate(asset.lastSeenAt)}` : ''}
                  </Text>
                  <Text size="xs" variant="muted">
                    {asset.lastReviewedAt
                      ? `Last reviewed ${formatDate(asset.lastReviewedAt)}`
                      : 'Not reviewed yet'}
                    {asset.lastScannedAt
                      ? ` · last scanned ${formatDate(asset.lastScannedAt)}`
                      : ''}
                  </Text>
                </Stack>
              </div>
            ) : null}
            <form id="asset-form" onSubmit={(event) => void handleSubmit(event)}>
              <fieldset disabled={!canEdit} className="min-w-0">
                <AssetFormFields
                  control={form.control}
                  memberOptions={memberOptions}
                  vendorOptions={vendorOptions}
                  isSynced={isSynced}
                />
              </fieldset>
            </form>
          </Stack>
        </SheetBody>
        {canEdit ? (
          <SheetFooter>
            {asset && !isSynced && canDelete ? (
              <Button
                type="button"
                variant="destructive"
                iconLeft={<TrashCan size={16} />}
                loading={isDeleting}
                onClick={() => void handleDelete()}
              >
                Remove
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="asset-form" loading={form.formState.isSubmitting}>
              {asset ? 'Save' : 'Add asset'}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
