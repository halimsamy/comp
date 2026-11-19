'use client';

import { type RevocationSystem, useAccessRevocations } from '@/hooks/use-access-revocations';
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Text,
} from '@trycompai/design-system';
import { Search } from '@trycompai/design-system/icons';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PendingSystemRow, RevokedSystemRow, SectionHeader } from './AccessRevocationRows';

interface AccessRevocationListProps {
  memberId: string;
  canEdit: boolean;
  onRevocationChange?: () => void;
}

/**
 * #82: the systems to remove a leaver from come from the access inventory
 * (Comp AI, connected integrations, manual systems). A system whose accounts
 * are all gone or disabled is confirmed by itself. Vendors without an
 * inventory are listed separately as optional extras.
 */
export function AccessRevocationList({ memberId, canEdit, onRevocationChange }: AccessRevocationListProps) {
  const { revocations, isLoading, revokeAccess, undoRevocation, revokeAll } = useAccessRevocations(memberId);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showVendors, setShowVendors] = useState(false);

  const { remaining, revoked, vendors } = useMemo(() => {
    const matches = (s: RevocationSystem) => s.name.toLowerCase().includes(searchQuery.toLowerCase());
    const systems = (revocations?.systems ?? []).filter(matches);
    return {
      remaining: systems.filter((s) => !s.revoked),
      revoked: systems.filter((s) => s.revoked),
      vendors: (revocations?.vendors ?? []).filter(matches),
    };
  }, [revocations, searchQuery]);

  const handleRevoke = async (systemKey: string, file?: File) => {
    setProcessingKey(systemKey);
    try {
      await revokeAccess(systemKey, file ? { file } : undefined);
      toast.success(file ? 'Access removal confirmed with evidence' : 'Access removal confirmed');
      onRevocationChange?.();
    } catch {
      toast.error('Failed to confirm access removal');
    } finally {
      setProcessingKey(null);
    }
  };

  const handleUndo = async (systemKey: string) => {
    setProcessingKey(systemKey);
    try {
      await undoRevocation(systemKey);
      toast.success('Revocation undone');
      onRevocationChange?.();
    } catch {
      toast.error('Failed to undo revocation');
    } finally {
      setProcessingKey(null);
    }
  };

  const handleConfirmAll = async () => {
    setIsConfirmingAll(true);
    try {
      await revokeAll();
      toast.success('All access removals confirmed');
      onRevocationChange?.();
    } catch {
      toast.error('Failed to confirm all');
    } finally {
      setIsConfirmingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="border-t bg-muted py-4 pl-4 pr-3.5 sm:pl-11">
        <Text variant="muted">Loading systems...</Text>
      </div>
    );
  }

  const systemCount = revocations?.systems.length ?? 0;
  const vendorCount = revocations?.vendors?.length ?? 0;
  if (!revocations || systemCount + vendorCount === 0) {
    return (
      <div className="border-t bg-muted py-4 pl-4 pr-3.5 sm:pl-11">
        <Text variant="muted">
          This person has no accounts in the access inventory. Connect an integration or add a system under
          People &gt; Access to track access removal.
        </Text>
      </div>
    );
  }

  const allConfirmed = revocations.revokedCount === revocations.totalSystems;
  const renderRow = (system: RevocationSystem) =>
    system.revoked ? (
      <RevokedSystemRow
        key={system.systemKey}
        system={system}
        canEdit={canEdit}
        isProcessing={processingKey === system.systemKey}
        onUndo={() => handleUndo(system.systemKey)}
      />
    ) : (
      <PendingSystemRow
        key={system.systemKey}
        system={system}
        canEdit={canEdit}
        isProcessing={processingKey === system.systemKey}
        onRevoke={(file) => handleRevoke(system.systemKey, file)}
      />
    );

  return (
    <div className="border-t bg-muted">
      <div className="flex items-center gap-2 border-b bg-background py-2 pl-4 pr-3.5 sm:pl-11">
        <InputGroup>
          <InputGroupAddon variant="icon">
            <Search size={16} />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search systems..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
        {canEdit && !allConfirmed && systemCount > 0 && (
          <div className="shrink-0">
            <Button size="sm" onClick={handleConfirmAll} disabled={isConfirmingAll} loading={isConfirmingAll}>
              Bulk confirm
            </Button>
          </div>
        )}
      </div>

      {remaining.length > 0 && (
        <>
          <SectionHeader label="Remaining" count={remaining.length} />
          <div className="max-h-[280px] overflow-y-auto">{remaining.map(renderRow)}</div>
        </>
      )}

      {revoked.length > 0 && (
        <>
          <SectionHeader label="Revoked" count={revoked.length} />
          <div className="max-h-[280px] overflow-y-auto">{revoked.map(renderRow)}</div>
        </>
      )}

      {vendors.length > 0 && (
        <>
          <div className="flex items-center justify-between bg-muted py-2 pl-4 pr-3.5 sm:pl-11">
            <Text size="xs" variant="muted">
              {vendors.length} vendors without an access inventory (optional)
            </Text>
            <Button variant="ghost" size="sm" onClick={() => setShowVendors((v) => !v)}>
              {showVendors ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showVendors && <div className="max-h-[280px] overflow-y-auto">{vendors.map(renderRow)}</div>}
        </>
      )}

      {remaining.length === 0 && revoked.length === 0 && vendors.length === 0 && (
        <div className="py-4 pl-4 pr-3.5 sm:pl-11">
          <Text size="sm" variant="muted">
            {searchQuery ? 'No matching systems' : 'No systems found'}
          </Text>
        </div>
      )}
    </div>
  );
}
