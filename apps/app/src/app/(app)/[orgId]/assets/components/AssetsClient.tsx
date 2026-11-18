'use client';

import { IsmsSummaryRow } from '@/app/(app)/[orgId]/documents/isms/components/shared';
import { useAssets, type Asset, type AssetPayload } from '@/hooks/use-assets';
import { usePermissions } from '@/hooks/use-permissions';
import {
  DataTableFilters,
  DataTableHeader,
  DataTableSearch,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  PageHeaderDescription,
  Stack,
  Text,
} from '@trycompai/design-system';
import { Security, UserAvatar, WarningAltFilled, Wikis } from '@trycompai/design-system/icons';
import { useMemo, useState } from 'react';
import {
  countByType,
  DEFAULT_ASSET_FILTERS,
  matchesAsset,
  UNOWNED,
  type AssetFilters,
} from '../lib/asset-filters';
import { CDE_SCOPE_LABELS, ENVIRONMENT_LABELS, SOURCE_LABELS } from '../lib/asset-labels';
import type { MemberOption } from './AssetFormFields';
import { AssetsHeaderActions } from './AssetsHeaderActions';
import { AssetSheet } from './AssetSheet';
import { AssetsTable } from './AssetsTable';
import { AssetTypeNav } from './AssetTypeNav';
import { FilterSelect, optionsFrom } from './FilterSelect';

/** Vanta-style inventory: type nav, scope/owner/environment filters, table and edit sheet. */
export function AssetsClient({
  initialAssets,
  memberOptions,
}: {
  initialAssets?: Asset[];
  memberOptions: MemberOption[];
}) {
  const { hasPermission } = usePermissions();
  const { assets, isLoading, error, create, update, remove, sync } = useAssets({
    initialData: initialAssets,
  });
  const [filters, setFilters] = useState<AssetFilters>(DEFAULT_ASSET_FILTERS);
  const [sheet, setSheet] = useState<{ open: boolean; asset: Asset | null }>({
    open: false,
    asset: null,
  });
  const sheetAsset = sheet.asset;

  const outsideType = useMemo(
    () => assets.filter((asset) => matchesAsset({ asset, filters, ignoreType: true })),
    [assets, filters],
  );
  const visible = outsideType.filter((asset) => matchesAsset({ asset, filters }));
  const ownerOptions = [
    { value: 'all', label: 'All owners' },
    { value: UNOWNED, label: 'No owner' },
    ...memberOptions
      .filter((member) => assets.some((asset) => asset.ownerId === member.id))
      .map((member) => ({ value: member.id, label: member.name })),
  ];

  const setFilter =
    <K extends keyof AssetFilters>(key: K) =>
    (value: AssetFilters[K]) =>
      setFilters((current) => ({ ...current, [key]: value }));

  const handleSubmit = (payload: AssetPayload) =>
    sheetAsset ? update({ id: sheetAsset.id, payload }) : create(payload);

  const header = (
    <PageHeader
      title="Assets"
      actions={
        <AssetsHeaderActions onAdd={() => setSheet({ open: true, asset: null })} onSync={sync} />
      }
    >
      <PageHeaderDescription>
        Every system in scope: cloud resources, repositories and devices found by your integrations,
        plus anything you add. Set owners and PCI DSS scope here (ISO 27001 A.5.9, PCI DSS 12.5.1).
      </PageHeaderDescription>
    </PageHeader>
  );

  if (error && assets.length === 0) {
    return (
      <Stack gap="6">
        {header}
        <Text size="sm" variant="destructive">
          Could not load the asset inventory. Refresh the page to try again.
        </Text>
      </Stack>
    );
  }
  if (isLoading) {
    return (
      <Stack gap="6">
        {header}
        <Text size="sm" variant="muted">
          Loading assets…
        </Text>
      </Stack>
    );
  }

  const inCde = assets.filter(
    (a) => a.cdeScope === 'in_scope' || a.cdeScope === 'connected',
  ).length;
  const unowned = assets.filter((a) => !a.ownerId).length;
  const unassessed = assets.filter((a) => a.cdeScope === 'unassessed').length;

  return (
    <Stack gap="6">
      {header}
      <IsmsSummaryRow
        stats={[
          { label: 'Assets', value: assets.length, icon: Wikis },
          { label: 'In or connected to the CDE', value: inCde, icon: Security },
          {
            label: 'Without an owner',
            value: unowned,
            icon: UserAvatar,
            tone: unowned > 0 ? 'warning' : 'success',
          },
          {
            label: 'PCI scope not assessed',
            value: unassessed,
            icon: WarningAltFilled,
            tone: unassessed > 0 ? 'warning' : 'success',
          },
        ]}
      />
      {assets.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No assets yet</EmptyTitle>
            <EmptyDescription>
              Connect AWS, GCP, Azure or GitHub under Integrations and enroll devices with the
              device agent, then refresh to build the inventory. Add anything else, like office
              networks or on-prem servers, by hand.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <AssetTypeNav
            value={filters.type}
            counts={countByType(outsideType)}
            total={outsideType.length}
            onChange={setFilter('type')}
          />
          <Stack gap="4">
            <DataTableHeader>
              <DataTableSearch
                placeholder="Search assets or identifiers"
                value={filters.search}
                onChange={setFilter('search')}
              />
              <DataTableFilters>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                  <FilterSelect
                    label="PCI scope"
                    value={filters.cdeScope}
                    options={optionsFrom({ allLabel: 'All scopes', labels: CDE_SCOPE_LABELS })}
                    onChange={setFilter('cdeScope')}
                  />
                  <FilterSelect
                    label="Environment"
                    value={filters.environment}
                    options={optionsFrom({
                      allLabel: 'All environments',
                      labels: ENVIRONMENT_LABELS,
                    })}
                    onChange={setFilter('environment')}
                  />
                  <FilterSelect
                    label="Owner"
                    value={filters.owner}
                    options={ownerOptions}
                    onChange={setFilter('owner')}
                  />
                  <FilterSelect
                    label="Source"
                    value={filters.source}
                    options={optionsFrom({ allLabel: 'All sources', labels: SOURCE_LABELS })}
                    onChange={setFilter('source')}
                  />
                </div>
              </DataTableFilters>
            </DataTableHeader>
            {visible.length === 0 ? (
              <Text size="sm" variant="muted">
                No assets match these filters.
              </Text>
            ) : (
              <AssetsTable assets={visible} onOpen={(asset) => setSheet({ open: true, asset })} />
            )}
          </Stack>
        </div>
      )}
      <AssetSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet({ open, asset: sheetAsset })}
        asset={sheetAsset}
        memberOptions={memberOptions}
        canEdit={hasPermission('integration', sheetAsset ? 'update' : 'create')}
        canDelete={hasPermission('integration', 'delete')}
        onSubmit={handleSubmit}
        onDelete={(asset) => remove(asset.id)}
      />
    </Stack>
  );
}
