'use client';

import { RequirementCodes } from '@/components/related-controls/RequirementCodes';
import type { ControlOverview } from '@/hooks/use-controls-overview';
import {
  DataTableFilters,
  DataTableHeader,
  DataTableSearch,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  ALL,
  type ControlsFilters,
  EMPTY_FILTERS,
  filterControls,
  filterOptions,
  NEEDS_REASSIGNMENT,
  STATUS_LABEL,
  UNASSIGNED,
} from '../lib/controls-overview';
import { ControlStatusPill, EvidenceCount } from './ControlStatusPill';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type Option = { value: string; label: string };

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="w-full sm:w-44">
      <Select items={options} value={value} onValueChange={(v) => onChange(String(v ?? ALL))}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Vanta-style controls list: requirement chips across frameworks, owner, evidence, status. */
export function ControlsOverviewTable({ controls }: { controls: ControlOverview[] }) {
  const router = useRouter();
  const { orgId } = useParams<{ orgId: string }>();
  const [filters, setFilters] = useState<ControlsFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const { frameworks, owners } = useMemo(() => filterOptions(controls), [controls]);
  const filtered = useMemo(() => filterControls({ controls, filters }), [controls, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [filters, pageSize]);

  const handleFilter = (key: keyof ControlsFilters) => (value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const handleOpen = (controlId: string) => router.push(`/${orgId}/controls/${controlId}`);

  return (
    <div className="flex flex-col gap-4">
      <DataTableHeader>
        <DataTableSearch
          placeholder="Search controls or codes (e.g. A.5.15, 7.2.1)"
          value={filters.search}
          onChange={handleFilter('search')}
        />
        <DataTableFilters>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <FilterSelect
              label="Framework"
              value={filters.framework}
              onChange={handleFilter('framework')}
              options={[
                { value: ALL, label: 'All frameworks' },
                ...frameworks.map((f) => ({ value: f, label: f })),
              ]}
            />
            <FilterSelect
              label="Owner"
              value={filters.owner}
              onChange={handleFilter('owner')}
              options={[
                { value: ALL, label: 'All owners' },
                { value: UNASSIGNED, label: 'Unassigned' },
                { value: NEEDS_REASSIGNMENT, label: 'Needs reassignment' },
                ...owners.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={handleFilter('status')}
              options={[
                { value: ALL, label: 'All statuses' },
                ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        </DataTableFilters>
      </DataTableHeader>

      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{controls.length === 0 ? 'No controls yet' : 'No matching controls'}</EmptyTitle>
            <EmptyDescription>
              {controls.length === 0
                ? 'Add a framework such as ISO 27001 or PCI DSS to load its controls, or create a custom control.'
                : 'Try a different search or clear the filters.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table
          variant="bordered"
          pagination={{
            page,
            pageCount,
            onPageChange: setPage,
            pageSize,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            onPageSizeChange: setPageSize,
          }}
        >
          <TableHeader>
            <TableRow>
              <TableHead>Control</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Frameworks</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((control) => (
              <TableRow
                key={control.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(control.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  handleOpen(control.id);
                }}
              >
                <TableCell>
                  <div className="flex max-w-[28rem] min-w-[14rem] flex-col gap-0.5 whitespace-normal">
                    <Text size="sm" weight="medium">
                      {control.name}
                    </Text>
                    {control.description && (
                      <span className="text-muted-foreground line-clamp-2 text-xs">
                        {control.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {control.owner ? (
                    <Text size="sm" variant={control.owner.deactivated ? 'warning' : undefined}>
                      {control.owner.name}
                      {control.owner.deactivated ? ' (left)' : ''}
                    </Text>
                  ) : (
                    <Text size="sm" variant="muted">
                      Unassigned
                    </Text>
                  )}
                </TableCell>
                <TableCell>
                  <RequirementCodes frameworks={control.frameworks} max={2} />
                </TableCell>
                <TableCell>
                  <EvidenceCount evidence={control.evidence} />
                </TableCell>
                <TableCell>
                  <ControlStatusPill status={control.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
