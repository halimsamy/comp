'use client';

import type { AuditRequirement, TeamAuditRequestPayload } from '@/hooks/use-audits';
import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { Button } from '@trycompai/design-system';
import { Upload } from '@trycompai/design-system/icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { parseRequestCsv } from '../lib/request-csv';

/** "Import request list (CSV)": the auditor's PBC list, received by email (#109). */
export function ImportRequestsButton({
  requirements,
  onImport,
}: {
  requirements: AuditRequirement[];
  onImport: (rows: TeamAuditRequestPayload[]) => Promise<number>;
}) {
  const { members } = useOrganizationMembers();
  const input = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setIsImporting(true);
    try {
      const { rows, errors } = parseRequestCsv({
        text: await file.text(),
        requirements,
        members: (members ?? []).map((m) => ({ id: m.id, name: m.user.name, email: m.user.email })),
      });
      if (errors.length > 0) {
        toast.error(`Nothing imported. ${errors.slice(0, 3).join('. ')}${errors.length > 3 ? '…' : ''}`);
        return;
      }
      if (rows.length === 0) {
        toast.error('The file has no requests');
        return;
      }
      const count = await onImport(rows);
      toast.success(`Imported ${count} request${count === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="Request list CSV"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <Button
        variant="outline"
        iconLeft={<Upload size={16} />}
        loading={isImporting}
        onClick={() => input.current?.click()}
      >
        Import request list (CSV)
      </Button>
    </>
  );
}
