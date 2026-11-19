'use client';

import { CreatePolicySheet } from '@/components/sheets/create-policy-sheet';
import { usePermissions } from '@/hooks/use-permissions';
import { authClient } from '@/utils/auth-client';
import { Add, Download, Upload } from '@trycompai/design-system/icons';
import type { Policy } from '@db';
import { Button } from '@trycompai/design-system';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { isAwaitingApprovalBy } from '../../lib/policy-register';
import { BulkUploadPoliciesSheet } from './BulkUploadPoliciesSheet';
import { ExportAcknowledgementsButton } from './ExportAcknowledgementsButton';
import { PolicyDownloadSheet } from './PolicyDownloadSheet';

interface PolicyPageActionsProps {
  policies: Policy[];
}

export function PolicyPageActions({ policies }: PolicyPageActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isDownloadSheetOpen, setIsDownloadSheetOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const { hasPermission } = usePermissions();
  const { data: activeMember } = authClient.useActiveMember();
  const awaitingMine = policies.filter((p) =>
    isAwaitingApprovalBy(p, activeMember?.id ?? null),
  ).length;

  // Bulk upload creates a draft policy AND attaches a PDF, so it needs both
  // policy:create (create step) and policy:update (attach step). Gating on
  // create alone lets create-only users spawn empty draft policies whose PDF
  // attach then 403s, leaving orphan drafts.
  const canBulkUpload =
    hasPermission('policy', 'create') && hasPermission('policy', 'update');

  const handleOpenDownloadSheet = () => setIsDownloadSheetOpen(true);

  const handleCreatePolicy = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('create-policy-sheet', 'true');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {awaitingMine > 0 && (
          <Link
            href={`${pathname}?awaiting=me`}
            className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-medium text-warning hover:bg-warning/20"
          >
            Awaiting my approval ({awaitingMine})
          </Link>
        )}
        {policies.length > 0 && hasPermission('policy', 'read') && <ExportAcknowledgementsButton />}
        {policies.length > 0 && (
          <Button
            variant="outline"
            iconLeft={<Download />}
            onClick={handleOpenDownloadSheet}
          >
            Download All
          </Button>
        )}
        {canBulkUpload && (
          <Button
            variant="outline"
            iconLeft={<Upload />}
            onClick={() => setIsBulkUploadOpen(true)}
          >
            Bulk upload
          </Button>
        )}
        {hasPermission('policy', 'create') && (
          <Button iconLeft={<Add />} onClick={handleCreatePolicy}>
            Create Policy
          </Button>
        )}
      </div>
      <CreatePolicySheet />
      <BulkUploadPoliciesSheet
        open={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
      />
      <PolicyDownloadSheet
        open={isDownloadSheetOpen}
        onOpenChange={setIsDownloadSheetOpen}
        policies={policies}
      />
    </>
  );
}
