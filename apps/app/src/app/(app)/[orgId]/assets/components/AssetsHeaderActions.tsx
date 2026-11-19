'use client';

import { useRegisterExport } from '@/components/register-export/ExportRegisterButton';
import type { AssetImportResult, FormImportPreview } from '@/hooks/use-assets';
import { usePermissions } from '@/hooks/use-permissions';
import { Add, Download, Renew } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { type HeaderAction, HeaderActions } from './HeaderActions';

const importedMessage = (result?: AssetImportResult) =>
  `Imported ${result?.total ?? 0} assets: ${result?.created ?? 0} new, ${result?.updated ?? 0} updated`;

/** Refresh, imports, review, CSV export and "Add asset", each gated by permission. */
export function AssetsHeaderActions({
  formImport,
  onAdd,
  onSync,
  onImportForm,
  onImportCsv,
  onReview,
}: {
  formImport: FormImportPreview | null;
  onAdd: () => void;
  onSync: () => Promise<{ assets: number; vulnerabilities: number } | undefined>;
  onImportForm: () => Promise<AssetImportResult | undefined>;
  onImportCsv: () => void;
  onReview: () => void;
}) {
  const { hasPermission } = usePermissions();
  const { exporting, handleExport } = useRegisterExport();
  const [busy, setBusy] = useState<'sync' | 'form' | null>(null);
  const canCreate = hasPermission('integration', 'create');
  const canUpdate = hasPermission('integration', 'update');

  const run = async (kind: 'sync' | 'form', task: () => Promise<string>) => {
    setBusy(kind);
    try {
      toast.success(await task());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };
  const handleSync = () =>
    run('sync', async () => {
      const result = await onSync();
      return `Inventory refreshed: ${result?.assets ?? 0} assets, ${result?.vulnerabilities ?? 0} open integration vulnerabilities`;
    });
  const handleImportForm = () => run('form', async () => importedMessage(await onImportForm()));

  const actions: HeaderAction[] = [];
  if (canUpdate) {
    actions.push({
      label: 'Refresh',
      icon: <Renew size={16} />,
      loading: busy === 'sync',
      onClick: () => void handleSync(),
    });
  }
  if (hasPermission('integration', 'read')) {
    actions.push({
      label: 'Export CSV',
      icon: <Download size={16} />,
      loading: exporting !== null,
      onClick: () => void handleExport('assets'),
    });
  }
  if (canCreate && formImport) {
    actions.push({
      label: `Import ${formImport.rows} rows from Infrastructure Inventory`,
      menuOnly: true,
      loading: busy === 'form',
      onClick: () => void handleImportForm(),
    });
  }
  if (canCreate) {
    actions.push({ label: 'Import CSV', menuOnly: true, onClick: onImportCsv });
  }
  if (canUpdate) {
    actions.push({ label: 'Mark inventory reviewed', menuOnly: true, onClick: onReview });
  }
  if (canCreate) {
    actions.push({ label: 'Add asset', icon: <Add size={16} />, primary: true, onClick: onAdd });
  }
  return <HeaderActions actions={actions} />;
}

export { importedMessage };
