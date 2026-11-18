import { describe, expect, it } from 'vitest';
import { countByType, DEFAULT_ASSET_FILTERS, matchesAsset, UNOWNED } from './asset-filters';
import { toAssetFormValues, toAssetPayload } from './asset-schema';
import { ASSETS, makeAsset } from './assets.fixtures';

const filter = (over: Partial<typeof DEFAULT_ASSET_FILTERS>) =>
  ASSETS.filter((asset) =>
    matchesAsset({ asset, filters: { ...DEFAULT_ASSET_FILTERS, ...over } }),
  ).map((a) => a.id);

describe('matchesAsset', () => {
  it('filters by search over name and identifier', () => {
    expect(filter({ search: 'rds' })).toEqual(['ast_1']);
    expect(filter({ search: 'FIREWALL' })).toEqual(['ast_3']);
  });

  it('filters by type, scope, source and owner', () => {
    expect(filter({ type: 'repository' })).toEqual(['ast_2']);
    expect(filter({ cdeScope: 'in_scope' })).toEqual(['ast_1']);
    expect(filter({ source: 'manual' })).toEqual(['ast_3']);
    expect(filter({ owner: UNOWNED })).toEqual(['ast_2']);
    expect(filter({ owner: 'mem_1' })).toEqual(['ast_1', 'ast_3']);
  });

  it('can ignore the type filter for category counts', () => {
    const filters = { ...DEFAULT_ASSET_FILTERS, type: 'repository' as const };
    expect(
      ASSETS.filter((asset) => matchesAsset({ asset, filters, ignoreType: true })),
    ).toHaveLength(3);
    expect(countByType(ASSETS).get('database')).toBe(1);
  });
});

describe('toAssetPayload', () => {
  it('sends name and type only for manual assets', () => {
    const synced = makeAsset();
    const payload = toAssetPayload({
      values: { ...toAssetFormValues(synced), ownerId: '' },
      asset: synced,
    });
    expect(payload).not.toHaveProperty('name');
    expect(payload.ownerId).toBeNull();

    const created = toAssetPayload({
      values: { ...toAssetFormValues(null), name: ' NAS ', description: '  ' },
      asset: null,
    });
    expect(created).toMatchObject({ name: 'NAS', type: 'other', description: null });
  });
});
