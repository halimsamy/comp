'use client';

import type { AssetType } from '@/hooks/use-assets';
import { Text } from '@trycompai/design-system';
import { ASSET_TYPE_LABELS, ASSET_TYPES } from '../lib/asset-labels';
import { FilterSelect } from './FilterSelect';

/**
 * Category list with counts (Vanta-style inventory nav) on desktop, a select
 * on smaller screens. Empty categories are hidden to keep the list short.
 */
export function AssetTypeNav({
  value,
  counts,
  total,
  onChange,
}: {
  value: AssetType | 'all';
  counts: Map<AssetType, number>;
  total: number;
  onChange: (value: AssetType | 'all') => void;
}) {
  const items: { value: AssetType | 'all'; label: string; count: number }[] = [
    { value: 'all', label: 'All assets', count: total },
    ...ASSET_TYPES.filter((type) => (counts.get(type) ?? 0) > 0 || type === value).map((type) => ({
      value: type,
      label: ASSET_TYPE_LABELS[type],
      count: counts.get(type) ?? 0,
    })),
  ];

  return (
    <>
      <div className="lg:hidden">
        <FilterSelect
          label="Asset type"
          value={value}
          options={items.map((item) => ({
            value: item.value,
            label: `${item.label} (${item.count})`,
          }))}
          onChange={onChange}
        />
      </div>
      <nav aria-label="Asset types" className="hidden flex-col gap-0.5 lg:flex">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onChange(item.value)}
              className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                active ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
              }`}
            >
              <Text size="sm" weight={active ? 'medium' : 'normal'}>
                {item.label}
              </Text>
              <Text size="xs" variant="muted">
                {item.count}
              </Text>
            </button>
          );
        })}
      </nav>
    </>
  );
}
