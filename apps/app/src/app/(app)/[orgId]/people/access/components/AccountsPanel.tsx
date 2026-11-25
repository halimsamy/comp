'use client';

import { downloadCsv } from '@/components/risks/workspace/risk-actions-csv';
import {
  useAccessAccounts,
  useAccessMutations,
  useAccessSystems,
  type AccessAccount,
  type ImportedAccount,
} from '@/hooks/use-access-reviews';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Text,
} from '@trycompai/design-system';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ACCOUNT_FILTERS, filterByFlag, formatDay, matchesSearch, type AccountFilter } from '../lib/access-labels';
import { buildAccountsCsv } from '../lib/accounts-csv';
import { AccountOwnerDialog, type OwnerOption, type OwnerValues } from './AccountOwnerDialog';
import { AccountsActions } from './AccountsActions';
import { AccountsTable } from './AccountsTable';
import { AddAccountDialog } from './AddAccountDialog';
import { AddSystemDialog, type SystemValues } from './AddSystemDialog';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { ImportAccountsDialog } from './ImportAccountsDialog';

/** Vanta-style account inventory: pick a system, filter by flag, map owners, export. */
export function AccountsPanel({ members }: { members: OwnerOption[] }) {
  const { systems, isLoading: systemsLoading, error: systemsError, mutate: refreshSystems } = useAccessSystems();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const systemKey = selectedKey ?? systems[0]?.key ?? null;
  const system = systems.find((s) => s.key === systemKey) ?? null;
  const { accounts, isLoading, error, mutate } = useAccessAccounts(systemKey);
  const mutations = useAccessMutations();
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('member', 'update');
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [search, setSearch] = useState('');
  const [ownerTarget, setOwnerTarget] = useState<AccessAccount | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AccessAccount | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const visible = useMemo(
    () =>
      filterByFlag({ rows: accounts, filter }).filter((a) =>
        matchesSearch({ values: [a.name, a.email, a.owner?.name ?? null], query: search }),
      ),
    [accounts, filter, search],
  );
  const manualId = system?.kind === 'manual' ? system.key.slice('manual:'.length) : null;

  const refresh = async () => {
    await Promise.all([mutate(), refreshSystems()]);
  };

  const handleSaveOwner = async (values: OwnerValues) => {
    if (!ownerTarget || !systemKey) return;
    try {
      await mutations.setOwner({
        systemKey,
        accountId: ownerTarget.accountId,
        memberId: values.mode === 'member' ? values.memberId : null,
        isServiceAccount: values.mode === 'service',
        justification: values.mode === 'service' ? values.justification : undefined,
      });
      await refresh();
      toast.success('Owner saved');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to save the owner');
      throw caught;
    }
  };

  const handleAddSystem = async (values: SystemValues) => {
    try {
      const created = await mutations.createSystem(values);
      await refreshSystems();
      setSelectedKey(created.key);
      toast.success('System added. Import its accounts next.');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to add the system');
      throw caught;
    }
  };

  const handleImport = async (rows: Parameters<typeof mutations.importAccounts>[0]['accounts']) => {
    if (!manualId) return;
    try {
      const { imported, ownersMapped } = await mutations.importAccounts({ id: manualId, accounts: rows });
      await refresh();
      toast.success(
        ownersMapped ? `${imported} accounts imported, ${ownersMapped} owners mapped` : `${imported} accounts imported`,
      );
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to import accounts');
      throw caught;
    }
  };

  const handleAddAccount = async (account: ImportedAccount) => {
    if (!manualId) return;
    try {
      await mutations.addAccount({ id: manualId, account });
      await refresh();
      toast.success('Account added');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to add the account');
      throw caught;
    }
  };

  const handleRemoveAccount = async () => {
    if (!manualId || !removeTarget) return;
    try {
      await mutations.removeAccount({ id: manualId, accountId: removeTarget.accountId });
      await refresh();
      toast.success('Account removed');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to remove the account');
    }
  };

  const handleDeleteSystem = async () => {
    if (!manualId || !system) return;
    try {
      await mutations.deleteSystem(manualId);
      setSelectedKey(null);
      await refreshSystems();
      toast.success('System deleted');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to delete the system');
    }
  };

  const handleExport = () => {
    if (!system) return;
    const day = new Date().toISOString().slice(0, 10);
    const slug = system.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadCsv({ csv: buildAccountsCsv({ system: system.name, accounts: visible }), filename: `accounts-${slug}-${day}.csv` });
  };

  if (systemsError || error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-6">
        <Text variant="muted">Couldn&apos;t load accounts.</Text>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-[260px]">
            <Select value={systemKey ?? ''} onValueChange={(value) => setSelectedKey(value || null)}>
              <SelectTrigger aria-label="System">
                <SelectValue placeholder="Select a system">
                  {(value: string) => systems.find((s) => s.key === value)?.name ?? 'Select a system'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {systems.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.name} · {s.accountCount}
                    {s.flaggedCount > 0 ? ` (${s.flaggedCount} flagged)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[220px]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search accounts"
              aria-label="Search accounts"
            />
          </div>
        </div>
        <AccountsActions
          systems={systems}
          isManual={Boolean(manualId)}
          canUpdate={canUpdate}
          canExportSystem={visible.length > 0}
          onAddAccount={() => setAddAccountOpen(true)}
          onAddSystem={() => setAddOpen(true)}
          onImport={() => setImportOpen(true)}
          onExportSystem={handleExport}
          onDeleteSystem={() => setConfirmDelete(true)}
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter accounts">
        {ACCOUNT_FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filter === option.value ? 'default' : 'outline'}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label} · {filterByFlag({ rows: accounts, filter: option.value }).length}
          </Button>
        ))}
      </div>

      {system && (
        <Text size="sm" variant="muted">
          {system.description ?? `${system.name} accounts`}
          {system.lastSyncAt ? ` · updated ${formatDay(system.lastSyncAt)}` : ''}
        </Text>
      )}

      {(systemsLoading || isLoading) && accounts.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{accounts.length === 0 ? 'No accounts yet' : 'Nothing matches'}</EmptyTitle>
            <EmptyDescription>
              {accounts.length === 0
                ? manualId
                  ? 'Add its accounts one by one, or import the user export of this system as CSV.'
                  : 'Accounts appear after the integration check runs. Connect Google Workspace, GitHub or AWS under Integrations, or add a system and import a CSV.'
                : 'No accounts match these filters.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <AccountsTable
          accounts={visible}
          canMapOwners={canUpdate}
          onMapOwner={setOwnerTarget}
          onRemove={canUpdate && manualId ? setRemoveTarget : undefined}
        />
      )}

      <AccountOwnerDialog
        account={ownerTarget}
        members={members}
        onOpenChange={(open) => !open && setOwnerTarget(null)}
        onSave={handleSaveOwner}
      />
      <AddSystemDialog open={addOpen} onOpenChange={setAddOpen} onSave={handleAddSystem} />
      <ConfirmDeleteDialog
        open={confirmDelete}
        title={`Delete ${system?.name ?? 'this system'}?`}
        description="The system, its accounts and owner mappings are deleted. Past access reviews keep their snapshot."
        onOpenChange={setConfirmDelete}
        onConfirm={handleDeleteSystem}
      />
      <ConfirmDeleteDialog
        open={removeTarget !== null}
        title={`Remove ${removeTarget?.name ?? 'this account'}?`}
        description="Remove it once its access is gone from the system. Access reviews keep their snapshot."
        confirmLabel="Remove"
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        onConfirm={handleRemoveAccount}
      />
      <AddAccountDialog
        systemName={system?.name ?? ''}
        open={addAccountOpen}
        onOpenChange={setAddAccountOpen}
        onSave={handleAddAccount}
      />
      <ImportAccountsDialog
        systemName={system?.name ?? ''}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
      />
    </div>
  );
}
