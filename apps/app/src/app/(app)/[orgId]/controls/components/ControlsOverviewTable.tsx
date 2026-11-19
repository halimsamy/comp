'use client';

import { RequirementCodes } from '@/components/related-controls/RequirementCodes';
import type { ControlOverview } from '@/hooks/use-controls-overview';
import {
  DataTableFilters,
  DataTableHeader,
  Checkbox,
  DataTableSearch,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
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
import { toast } from 'sonner';
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
import { type BulkSetOwner, ControlsBulkBar } from './ControlsBulkBar';
import { ControlStatusPill, EvidenceCount } from './ControlStatusPill';
import { FilterSelect } from './FilterSelect';
import { OwnerSelect, UNASSIGNED_OWNER } from './OwnerSelect';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

/** Vanta-style controls list: requirement chips across frameworks, owner, evidence, status. */
export function ControlsOverviewTable({
  controls,
  canEdit = false,
  bulkSetOwner,
}: {
  controls: ControlOverview[];
  /** control:update: row checkboxes, bulk bar and inline owner select. */
  canEdit?: boolean;
  bulkSetOwner?: BulkSetOwner;
}) {
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const editable = canEdit && !!bulkSetOwner;
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const handleToggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const handleTogglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (allOnPageSelected) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  const handleRowOwner = async ({ controlId, ownerId }: { controlId: string; ownerId: string | null }) => {
    if (!bulkSetOwner) return;
    try {
      await bulkSetOwner({ controlIds: [controlId], ownerId });
    } catch {
      toast.error('Failed to update owner');
    }
  };

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

      {editable && selected.size > 0 && bulkSetOwner && (
        <ControlsBulkBar
          selectedIds={[...selected]}
          onClear={() => setSelected(new Set())}
          onApply={bulkSetOwner}
        />
      )}

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
              {editable && (
                <TableHead>
                  <Checkbox aria-label="Select all on this page" checked={allOnPageSelected} onCheckedChange={handleTogglePage} />
                </TableHead>
              )}
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
                {editable && (
                  <TableCell>
                    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${control.name}`}
                        checked={selected.has(control.id)}
                        onCheckedChange={() => handleToggleRow(control.id)}
                      />
                    </div>
                  </TableCell>
                )}
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
                  {editable ? (
                    <div className="w-44" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <OwnerSelect
                        label={`Owner of ${control.name}`}
                        value={control.owner?.id ?? UNASSIGNED_OWNER}
                        departed={control.owner?.deactivated ? control.owner : null}
                        onChange={(ownerId) => handleRowOwner({ controlId: control.id, ownerId })}
                      />
                    </div>
                  ) : control.owner ? (
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
