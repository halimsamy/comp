'use client';

import type { AssetImportResult } from '@/hooks/use-assets';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Stack,
} from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';
import { importedMessage } from './AssetsHeaderActions';

const MAX_BYTES = 5_000_000;

/** Bulk-add manual assets from a spreadsheet export; re-importing updates rows with the same name. */
export function ImportAssetsDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (csv: string) => Promise<AssetImportResult | undefined>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('The file is larger than 5 MB.');
      return;
    }
    setIsImporting(true);
    try {
      toast.success(importedMessage(await onImport(await file.text())));
      setFile(null);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import assets from CSV</DialogTitle>
          <DialogDescription>
            One row per asset with a name column. Optional columns: description, type, environment,
            location, owner (name or email), vendor, version, end of support and last reviewed. Rows
            with the same name update the existing asset.
          </DialogDescription>
        </DialogHeader>
        <Stack gap="1">
          <Label htmlFor="asset-import-file">CSV file</Label>
          <Input
            id="asset-import-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Stack>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!file} loading={isImporting} onClick={() => void handleImport()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
