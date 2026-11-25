'use client';

import { downloadCsv } from '@/components/risks/workspace/risk-actions-csv';
import type { AccessAccount, AccessSystem } from '@/hooks/use-access-reviews';
import { useAccessRoleMutations } from '@/hooks/use-access-roles';
import { api } from '@/lib/api-client';
import { useState } from 'react';
import { toast } from 'sonner';
import { FLAG_LABEL } from '../lib/access-labels';
import { buildAllSystemsCsv, csvCell } from '../lib/accounts-csv';

const day = () => new Date().toISOString().slice(0, 10);

/** #97: one CSV of every system's accounts, and a privileged-users list for PCI DSS 7.2.2 / 8.4.1. */
export function useAccessExports(systems: AccessSystem[]) {
  const { listPrivileged } = useAccessRoleMutations();
  const [busy, setBusy] = useState<'all' | 'privileged' | null>(null);

  const handleExportAll = async () => {
    setBusy('all');
    try {
      const perSystem = await Promise.all(
        systems.map(async (system) => {
          const response = await api.get<{ data: AccessAccount[] }>(
            `/v1/access/accounts?system=${encodeURIComponent(system.key)}`,
          );
          if (response.error) throw new Error(response.error);
          const accounts = response.data?.data;
          return { system: system.name, accounts: Array.isArray(accounts) ? accounts : [] };
        }),
      );
      downloadCsv({ csv: buildAllSystemsCsv(perSystem), filename: `access-inventory-${day()}.csv` });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to export accounts');
    } finally {
      setBusy(null);
    }
  };

  const handleExportPrivileged = async () => {
    setBusy('privileged');
    try {
      const rows = await listPrivileged();
      const header = ['System', 'Account', 'Email', 'Owner', 'Roles', 'MFA', 'Last login', 'Flags'];
      const csv = [header, ...rows.map((r) => [
        r.systemName,
        r.name,
        r.email ?? '',
        r.ownerName ?? 'Unmapped',
        r.roles.join('; '),
        r.mfaEnabled === null ? 'Unknown' : r.mfaEnabled ? 'On' : 'Off',
        r.lastLoginAt ? r.lastLoginAt.slice(0, 10) : '',
        r.flags.map((f) => FLAG_LABEL[f] ?? f).join('; '),
      ])]
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n');
      downloadCsv({ csv, filename: `privileged-users-${day()}.csv` });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to export privileged users');
    } finally {
      setBusy(null);
    }
  };

  return { busy, handleExportAll, handleExportPrivileged };
}
