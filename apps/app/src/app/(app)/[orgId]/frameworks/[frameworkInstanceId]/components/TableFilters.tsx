'use client';

import { FilterSelect } from '@/app/(app)/[orgId]/controls/components/FilterSelect';
import { APPLICABILITY_LABELS } from '@/lib/control-compliance';
import { parseAsString, useQueryState } from 'nuqs';
import type { ControlItem } from './framework-controls-shared';
import { ALL, UNASSIGNED, ownerOptions } from './table-filters';

const queryOption = parseAsString.withDefault(ALL).withOptions({ shallow: true });
const clear = (value: string) => (value === ALL ? null : value);

/** Owner + status filters for the Controls tab, kept in the URL (?cowner, ?cstatus) so cards can link to them. */
export function useControlTableFilters() {
  const [owner, setOwner] = useQueryState('cowner', queryOption);
  const [status, setStatus] = useQueryState('cstatus', queryOption);
  return {
    owner,
    status,
    isActive: owner !== ALL || status !== ALL,
    setOwner: (value: string) => setOwner(clear(value)),
    setStatus: (value: string) => setStatus(clear(value)),
  };
}

export function ControlTableFilters({
  items,
  filters,
}: {
  items: ControlItem[];
  filters: ReturnType<typeof useControlTableFilters>;
}) {
  return (
    <>
      <FilterSelect
        label="Owner"
        value={filters.owner}
        onChange={filters.setOwner}
        options={[
          { value: ALL, label: 'All owners' },
          { value: UNASSIGNED, label: 'Unassigned' },
          ...ownerOptions(items),
        ]}
      />
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={filters.setStatus}
        options={[
          { value: ALL, label: 'All statuses' },
          { value: 'incomplete', label: 'Needs work' },
          { value: 'completed', label: 'Satisfied' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'not_started', label: 'Not started' },
          { value: 'not_applicable', label: 'Not applicable' },
        ]}
      />
    </>
  );
}

/** Status + applicability filters for the Requirements tab (?rstatus, ?rapplic). */
export function useRequirementTableFilters() {
  const [status, setStatus] = useQueryState('rstatus', queryOption);
  const [applicability, setApplicability] = useQueryState('rapplic', queryOption);
  return {
    status,
    applicability,
    isActive: status !== ALL || applicability !== ALL,
    setStatus: (value: string) => setStatus(clear(value)),
    setApplicability: (value: string) => setApplicability(clear(value)),
  };
}

export function RequirementTableFilters({
  filters,
}: {
  filters: ReturnType<typeof useRequirementTableFilters>;
}) {
  return (
    <>
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={filters.setStatus}
        options={[
          { value: ALL, label: 'All statuses' },
          { value: 'open', label: 'Not satisfied' },
          { value: 'satisfied', label: 'Satisfied' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'not_started', label: 'Not started' },
          { value: 'no_controls', label: 'No controls' },
        ]}
      />
      <FilterSelect
        label="Applicability"
        value={filters.applicability}
        onChange={filters.setApplicability}
        options={[
          { value: ALL, label: 'Any applicability' },
          ...Object.entries(APPLICABILITY_LABELS).map(([value, label]) => ({ value, label })),
        ]}
      />
    </>
  );
}
