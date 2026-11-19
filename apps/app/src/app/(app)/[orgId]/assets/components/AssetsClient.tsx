'use client';

import { IsmsSummaryRow } from '@/app/(app)/[orgId]/documents/isms/components/shared';
import { useAssets, type Asset, type AssetPayload, type AssetsResponse } from '@/hooks/use-assets';
import { usePermissions } from '@/hooks/use-permissions';
import { PageHeader, PageHeaderDescription, Stack, Text } from '@trycompai/design-system';
import { Security, UserAvatar, WarningAltFilled, Wikis } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';
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
import { AssetsEmptyState } from './AssetsEmptyState';
import { AssetsHeaderActions, importedMessage } from './AssetsHeaderActions';
import { AssetSheet } from './AssetSheet';
import { AssetsTable } from './AssetsTable';
import { AssetTypeNav } from './AssetTypeNav';
import { FilterBar } from './FilterBar';
import { FilterSelect, optionsFrom } from './FilterSelect';
import { ImportAssetsDialog } from './ImportAssetsDialog';
import { ReviewInventoryDialog } from './ReviewInventoryDialog';

/** Vanta-style inventory: type nav, scope/owner/environment filters, table and edit sheet. */
export function AssetsClient({
  initialData,
  memberOptions,
  vendorOptions,
}: {
  initialData?: AssetsResponse;
  memberOptions: MemberOption[];
  vendorOptions: MemberOption[];
}) {
  const { hasPermission } = usePermissions();
  const { assets, review, formImport, isLoading, error, ...actions } = useAssets({ initialData });
  const [filters, setFilters] = useState<AssetFilters>(DEFAULT_ASSET_FILTERS);
  // Deep link from the owner email (/assets?id=ast_…) opens that asset on load.
  const linkedId = useSearchParams()?.get('id') ?? null;
  const [sheet, setSheet] = useState<{ open: boolean; asset: Asset | null }>(() => {
    const linked = assets.find((a) => a.id === linkedId) ?? null;
    return { open: linked !== null, asset: linked };
  });
  const [dialog, setDialog] = useState<'csv' | 'review' | null>(null);
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
    sheetAsset ? actions.update({ id: sheetAsset.id, payload }) : actions.create(payload);

  const reviewedLine = review.lastReviewedAt
    ? ` Last reviewed ${format(new Date(review.lastReviewedAt), 'MMM d, yyyy')}${review.reviewedBy ? ` by ${review.reviewedBy.name || review.reviewedBy.email}` : ''}.`
    : ' Not reviewed yet: mark the inventory reviewed at least once a year (PCI DSS 12.5.2).';

  const header = (
    <PageHeader
      title="Assets"
      actions={
        <AssetsHeaderActions
          formImport={formImport}
          onAdd={() => setSheet({ open: true, asset: null })}
          onSync={actions.sync}
          onImportForm={actions.importFromForm}
          onImportCsv={() => setDialog('csv')}
          onReview={() => setDialog('review')}
        />
      }
    >
      <PageHeaderDescription>
        Every system in scope: cloud resources, repositories and devices found by your integrations,
        plus anything you add. Set owners and PCI DSS scope here (ISO 27001 A.5.9, PCI DSS 12.5.1).
        {assets.length > 0 ? reviewedLine : ''}
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
        <AssetsEmptyState
          formImport={formImport}
          canImport={hasPermission('integration', 'create')}
          onImportForm={async () => importedMessage(await actions.importFromForm())}
        />
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <AssetTypeNav
            value={filters.type}
            counts={countByType(outsideType)}
            total={outsideType.length}
            onChange={setFilter('type')}
          />
          <div className="min-w-0">
            <Stack gap="4">
              <FilterBar
                placeholder="Search assets, identifiers or locations"
                search={filters.search}
                onSearch={setFilter('search')}
              >
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
              </FilterBar>
              {visible.length === 0 ? (
                <Text size="sm" variant="muted">
                  No assets match these filters.
                </Text>
              ) : (
                <AssetsTable assets={visible} onOpen={(asset) => setSheet({ open: true, asset })} />
              )}
            </Stack>
          </div>
        </div>
      )}
      <AssetSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet({ open, asset: sheetAsset })}
        asset={sheetAsset}
        memberOptions={memberOptions}
        vendorOptions={vendorOptions}
        canEdit={hasPermission('integration', sheetAsset ? 'update' : 'create')}
        canDelete={hasPermission('integration', 'delete')}
        onSubmit={handleSubmit}
        onDelete={(asset) => actions.remove(asset.id)}
      />
      <ImportAssetsDialog
        open={dialog === 'csv'}
        onOpenChange={(open) => setDialog(open ? 'csv' : null)}
        onImport={actions.importCsv}
      />
      <ReviewInventoryDialog
        open={dialog === 'review'}
        onOpenChange={(open) => setDialog(open ? 'review' : null)}
        assets={assets}
        onConfirm={actions.markReviewed}
      />
    </Stack>
  );
}
