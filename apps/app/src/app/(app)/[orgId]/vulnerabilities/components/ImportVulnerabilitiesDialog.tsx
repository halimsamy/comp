'use client';

import type { ImportResult, ImportVulnerabilitiesPayload } from '@/hooks/use-vulnerabilities';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
} from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';

type Source = ImportVulnerabilitiesPayload['source'];

const SOURCES: Record<Source, string> = {
  asv_scan: 'ASV scan (PCI DSS 11.3.2)',
  pentest: 'Penetration test (PCI DSS 11.4)',
};

const MAX_BYTES = 5_000_000;

/** Upload a scanner CSV export once; it feeds the vulnerability list and its SLAs. */
export function ImportVulnerabilitiesDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (payload: ImportVulnerabilitiesPayload) => Promise<ImportResult | undefined>;
}) {
  const [source, setSource] = useState<Source>('asv_scan');
  const [file, setFile] = useState<File | null>(null);
  const [resolveMissing, setResolveMissing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('The file is larger than 5 MB. Export only open findings and try again.');
      return;
    }
    setIsImporting(true);
    try {
      const result = await onImport({ source, csv: await file.text(), resolveMissing });
      toast.success(
        `Imported: ${result?.created ?? 0} new, ${result?.updated ?? 0} updated, ${result?.reopened ?? 0} reopened, ${result?.resolved ?? 0} resolved`,
      );
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
          <DialogTitle>Import findings from CSV</DialogTitle>
          <DialogDescription>
            Upload the CSV export of an ASV scan or penetration test (Qualys, Tenable, Nessus or any
            file with title, severity and host columns). Re-importing a rescan updates the same
            findings instead of duplicating them.
          </DialogDescription>
        </DialogHeader>
        <Stack gap="4">
          <Stack gap="1">
            <Label htmlFor="vuln-import-source">Source</Label>
            <Select value={source} onValueChange={(next) => next && setSource(next as Source)}>
              <SelectTrigger id="vuln-import-source" aria-label="Source">
                <SelectValue>{SOURCES[source]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCES) as Source[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SOURCES[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Stack>
          <Stack gap="1">
            <Label htmlFor="vuln-import-file">CSV file</Label>
            <Input
              id="vuln-import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Stack>
          <div className="flex items-start gap-2">
            <Checkbox
              id="vuln-import-resolve"
              checked={resolveMissing}
              onCheckedChange={(checked) => setResolveMissing(checked === true)}
            />
            <Label htmlFor="vuln-import-resolve">
              <Text size="sm">
                This is a rescan: resolve open {source === 'asv_scan' ? 'ASV' : 'pentest'} findings
                that are not in this file
              </Text>
            </Label>
          </div>
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
