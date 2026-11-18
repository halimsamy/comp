'use client';

import { ExportRegisterButton } from '@/components/register-export/ExportRegisterButton';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@trycompai/design-system';
import { Add, Renew, Upload } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';

/** Refresh, CSV import / export and manual logging, each gated by permission. */
export function VulnerabilitiesHeaderActions({
  onSync,
  onImport,
  onCreate,
}: {
  onSync: () => Promise<{ vulnerabilities: number } | undefined>;
  onImport: () => void;
  onCreate: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [isSyncing, setIsSyncing] = useState(false);
  const canCreate = hasPermission('integration', 'create');

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await onSync();
      toast.success(`Refreshed: ${result?.vulnerabilities ?? 0} open integration findings`);
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
      <ExportRegisterButton options={[{ register: 'vulnerabilities', label: 'Vulnerabilities' }]} />
      {canCreate ? (
        <Button variant="outline" iconLeft={<Upload size={16} />} onClick={onImport}>
          Import CSV
        </Button>
      ) : null}
      {canCreate ? (
        <Button iconLeft={<Add size={16} />} onClick={onCreate}>
          Log vulnerability
        </Button>
      ) : null}
    </div>
  );
}
