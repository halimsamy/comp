'use client';

import type { AccessReviewDetail } from '@/hooks/use-access-reviews';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@trycompai/design-system';
import { ACCOUNT_FILTERS, filterByFlag, type AccountFilter } from '../lib/access-labels';

export const DECISION_FILTERS = [
  { value: 'all', label: 'All decisions' },
  { value: 'pending', label: 'Pending' },
  { value: 'decided', label: 'Decided' },
] as const;
export type DecisionFilter = (typeof DECISION_FILTERS)[number]['value'];

/** System, decision, search and flag filters of an access review. */
export function ReviewFilters({
  review,
  systemNames,
  systemId,
  decisionFilter,
  search,
  flag,
  onSystemChange,
  onDecisionChange,
  onSearchChange,
  onFlagChange,
}: {
  review: AccessReviewDetail;
  systemNames: Map<string, string>;
  systemId: string;
  decisionFilter: DecisionFilter;
  search: string;
  flag: AccountFilter;
  onSystemChange: (value: string) => void;
  onDecisionChange: (value: DecisionFilter) => void;
  onSearchChange: (value: string) => void;
  onFlagChange: (value: AccountFilter) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="w-full sm:w-[220px]">
          <Select value={systemId} onValueChange={(value) => onSystemChange(value ?? 'all')}>
            <SelectTrigger aria-label="System">
              <SelectValue>{(value: string) => (value === 'all' ? 'All systems' : systemNames.get(value))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All systems</SelectItem>
              {review.systems.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.systemName}
                  {s.reviewerName ? ` · ${s.reviewerName}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[180px]">
          <Select value={decisionFilter} onValueChange={(value) => onDecisionChange(value ?? 'all')}>
            <SelectTrigger aria-label="Decision">
              <SelectValue>{(value: string) => DECISION_FILTERS.find((f) => f.value === value)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {DECISION_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[220px]">
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search accounts"
            aria-label="Search accounts"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by flag">
        {ACCOUNT_FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={flag === option.value ? 'default' : 'outline'}
            aria-pressed={flag === option.value}
            onClick={() => onFlagChange(option.value)}
          >
            {option.label} · {filterByFlag({ rows: review.items, filter: option.value }).length}
          </Button>
        ))}
      </div>
    </>
  );
}
