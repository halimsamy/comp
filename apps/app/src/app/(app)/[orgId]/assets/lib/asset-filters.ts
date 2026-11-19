import type {
  Asset,
  AssetCdeScope,
  AssetEnvironment,
  AssetSource,
  AssetType,
} from '@/hooks/use-assets';

export const UNOWNED = 'unowned';

export interface AssetFilters {
  search: string;
  type: AssetType | 'all';
  environment: AssetEnvironment | 'all';
  cdeScope: AssetCdeScope | 'all';
  source: AssetSource | 'all';
  /** 'all', 'unowned' or a member id. */
  owner: string;
}

export const DEFAULT_ASSET_FILTERS: AssetFilters = {
  search: '',
  type: 'all',
  environment: 'all',
  cdeScope: 'all',
  source: 'all',
  owner: 'all',
};

/** Every filter except `type`, so the category list can show per-type counts. */
export function matchesAsset({
  asset,
  filters,
  ignoreType = false,
}: {
  asset: Asset;
  filters: AssetFilters;
  ignoreType?: boolean;
}): boolean {
  const q = filters.search.trim().toLowerCase();
  if (
    q &&
    !`${asset.name} ${asset.externalId} ${asset.description ?? ''} ${asset.location ?? ''} ${asset.vendor?.name ?? ''}`
      .toLowerCase()
      .includes(q)
  ) {
    return false;
  }
  if (!ignoreType && filters.type !== 'all' && asset.type !== filters.type) return false;
  if (filters.environment !== 'all' && asset.environment !== filters.environment) return false;
  if (filters.cdeScope !== 'all' && asset.cdeScope !== filters.cdeScope) return false;
  if (filters.source !== 'all' && asset.source !== filters.source) return false;
  if (filters.owner === UNOWNED) return asset.ownerId === null;
  return filters.owner === 'all' || asset.ownerId === filters.owner;
}

export function countByType(assets: Asset[]): Map<AssetType, number> {
  const counts = new Map<AssetType, number>();
  for (const asset of assets) counts.set(asset.type, (counts.get(asset.type) ?? 0) + 1);
  return counts;
}
