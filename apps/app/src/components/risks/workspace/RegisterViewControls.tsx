'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@trycompai/design-system';
import { humanizeCategory, REGISTER_GROUP_OPTIONS } from './register-grouping';

const RISK_CATEGORIES = [
  'customer',
  'fraud',
  'governance',
  'operations',
  'other',
  'people',
  'regulatory',
  'reporting',
  'resilience',
  'technology',
  'vendor_management',
] as const;

/** Category filter and "group by" for the risk register (both URL-backed by the caller). */
export function RegisterViewControls({
  category,
  onCategoryChange,
  groupBy,
  onGroupByChange,
}: {
  category: string;
  onCategoryChange: (value: string | null) => void;
  groupBy: string;
  onGroupByChange: (value: string | null) => void;
}) {
  return (
    <>
      <div className="w-full md:w-[180px]">
        <Select
          value={category || 'all'}
          onValueChange={(value) => onCategoryChange(!value || value === 'all' ? null : value)}
        >
          <SelectTrigger aria-label="Category">
            <SelectValue placeholder="Category">
              {(value: string) =>
                value && value !== 'all' ? humanizeCategory(value) : 'All categories'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {RISK_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {humanizeCategory(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-full md:w-[170px]">
        <Select
          value={groupBy || 'none'}
          onValueChange={(value) => onGroupByChange(!value || value === 'none' ? null : value)}
        >
          <SelectTrigger aria-label="Group by">
            <SelectValue placeholder="Group by">
              {(value: string) => {
                const option = REGISTER_GROUP_OPTIONS.find((o) => o.value === value);
                return option ? `Group: ${option.label}` : 'No grouping';
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            {REGISTER_GROUP_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                Group by {option.label.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
