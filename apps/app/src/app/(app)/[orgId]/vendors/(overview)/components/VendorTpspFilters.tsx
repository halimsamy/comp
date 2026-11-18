'use client';

import type { Vendor } from '@/hooks/use-vendors';
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';
import { WarningAlt } from '@trycompai/design-system/icons';
import {
  CRITICALITY_OPTIONS,
  daysUntil,
  REVIEW_STATUS,
  type CriticalityFilter,
  type DocumentFilter,
  type VendorTpspFilters as Filters,
  type ReviewFilter,
} from '../../lib/vendor-tpsp';

const CRITICALITY_ITEMS: { value: CriticalityFilter; label: string }[] = [
  { value: 'all', label: 'All criticality' },
  ...CRITICALITY_OPTIONS.map(({ value, label }) => ({ value, label })),
  { value: 'unset', label: 'Not classified' },
];

const REVIEW_ITEMS: { value: ReviewFilter; label: string }[] = [
  { value: 'all', label: 'All reviews' },
  { value: 'overdue', label: 'Review overdue' },
  { value: 'due_soon', label: 'Review due soon' },
  { value: 'never_reviewed', label: 'Never reviewed' },
  { value: 'current', label: 'Reviewed' },
];

const DOCUMENT_ITEMS: { value: DocumentFilter; label: string }[] = [
  { value: 'all', label: 'All documents' },
  { value: 'expiring', label: 'Expiring documents' },
];

function FilterSelect<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: T;
  items: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="w-full sm:w-[180px]">
      <Select value={value} onValueChange={(next) => next && onChange(next as T)}>
        <SelectTrigger aria-label={label}>
          <SelectValue>{items.find((item) => item.value === value)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Criticality, review status and expiring-document filters for the vendors table. */
export function VendorTpspFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <FilterSelect
        label="Criticality"
        value={filters.criticality}
        items={CRITICALITY_ITEMS}
        onChange={(criticality) => onChange({ ...filters, criticality })}
      />
      <FilterSelect
        label="Review status"
        value={filters.review}
        items={REVIEW_ITEMS}
        onChange={(review) => onChange({ ...filters, review })}
      />
      <FilterSelect
        label="Documents"
        value={filters.documents}
        items={DOCUMENT_ITEMS}
        onChange={(documents) => onChange({ ...filters, documents })}
      />
    </div>
  );
}

export function VendorCriticalityCell({ vendor }: { vendor: Vendor }) {
  const option = CRITICALITY_OPTIONS.find((o) => o.value === vendor.criticality);
  if (!option) return <span className="text-xs text-muted-foreground">Not set</span>;
  return <Badge variant={option.variant}>{option.label}</Badge>;
}

/** Review badge plus a warning when documents are expiring. */
export function VendorReviewCell({ vendor }: { vendor: Vendor }) {
  const status = REVIEW_STATUS[vendor.reviewStatus ?? 'never_reviewed'];
  const expiring = vendor.expiringDocumentsCount ?? 0;
  const dueIn = vendor.nextReviewDue ? daysUntil({ date: vendor.nextReviewDue }) : null;
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant={status.variant}>{status.label}</Badge>
      {dueIn !== null && vendor.reviewStatus === 'due_soon' && (
        <span className="text-xs text-muted-foreground">in {dueIn} days</span>
      )}
      {expiring > 0 && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <WarningAlt size={12} />
          {expiring} expiring doc{expiring === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
