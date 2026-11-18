'use client';

import { ExportRegisterButton } from '@/components/register-export/ExportRegisterButton';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@trycompai/design-system';
import { Add, Renew } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';

/** Refresh from integrations, CSV export and "Add asset", each gated by permission. */
export function AssetsHeaderActions({
  onAdd,
  onSync,
}: {
  onAdd: () => void;
  onSync: () => Promise<{ assets: number; vulnerabilities: number } | undefined>;
}) {
  const { hasPermission } = usePermissions();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await onSync();
      toast.success(
        `Inventory refreshed: ${result?.assets ?? 0} assets, ${result?.vulnerabilities ?? 0} open integration vulnerabilities`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {hasPermission('integration', 'update') ? (
        <Button
          variant="outline"
          iconLeft={<Renew size={16} />}
          loading={isSyncing}
          onClick={() => void handleSync()}
        >
          Refresh
        </Button>
      ) : null}
      <ExportRegisterButton options={[{ register: 'assets', label: 'Asset inventory' }]} />
      {hasPermission('integration', 'create') ? (
        <Button iconLeft={<Add size={16} />} onClick={onAdd}>
          Add asset
        </Button>
      ) : null}
    </div>
  );
}
