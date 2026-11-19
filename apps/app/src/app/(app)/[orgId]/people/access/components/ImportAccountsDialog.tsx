'use client';

import type { ImportedAccount } from '@/hooks/use-access-reviews';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Text,
} from '@trycompai/design-system';
import { useState, type ChangeEvent } from 'react';
import { parseAccountsCsv } from '../lib/accounts-csv';

const MAX_BYTES = 5 * 1024 * 1024;

/** Replace a manual system's account list with a CSV export. */
export function ImportAccountsDialog({
  systemName,
  open,
  onOpenChange,
  onImport,
}: {
  systemName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (accounts: ImportedAccount[]) => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<ImportedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setAccounts([]);
      setError(null);
    }
    onOpenChange(next);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('The file must be under 5 MB.');
      return;
    }
    const result = parseAccountsCsv(await file.text());
    setAccounts(result.accounts);
    setError(result.error);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(accounts);
      handleOpenChange(false);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Import accounts: {systemName}</DialogTitle>
          <DialogDescription>
            Upload the system&apos;s user export as CSV. It replaces the current list. Columns:
            account (or email), name, email, roles (separated by ;), admin, mfa, status, type (human,
            service, shared), last login, owner (email or name) and justification (why a service or
            shared account exists).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="accounts-csv">CSV file</Label>
          <input
            id="accounts-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleFile(event)}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          {error && (
            <span role="alert" className="text-xs text-destructive">
              {error}
            </span>
          )}
          {!error && accounts.length > 0 && (
            <Text size="sm" variant="muted">
              {accounts.length} accounts ready to import.
            </Text>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleImport()} disabled={accounts.length === 0 || !!error} loading={importing}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
