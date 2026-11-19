'use client';

import { useRegisterExport } from '@/components/register-export/ExportRegisterButton';
import { usePermissions } from '@/hooks/use-permissions';
import { Add, Download, Renew, Upload } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { type HeaderAction, HeaderActions } from '../../assets/components/HeaderActions';

/** Refresh, scan import, CSV export and manual logging, each gated by permission. */
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
  const { exporting, handleExport } = useRegisterExport();
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

  const actions: HeaderAction[] = [];
  if (hasPermission('integration', 'update')) {
    actions.push({
      label: 'Refresh',
      icon: <Renew size={16} />,
      loading: isSyncing,
      onClick: () => void handleSync(),
    });
  }
  if (hasPermission('integration', 'read')) {
    actions.push({
      label: 'Export CSV',
      icon: <Download size={16} />,
      loading: exporting !== null,
      onClick: () => void handleExport('vulnerabilities'),
    });
  }
  if (canCreate) {
    actions.push({ label: 'Import scan', icon: <Upload size={16} />, onClick: onImport });
    actions.push({
      label: 'Log vulnerability',
      icon: <Add size={16} />,
      primary: true,
      onClick: onCreate,
    });
  }
  return <HeaderActions actions={actions} />;
}
