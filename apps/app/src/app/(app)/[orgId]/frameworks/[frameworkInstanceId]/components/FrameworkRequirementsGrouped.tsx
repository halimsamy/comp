'use client';

import type { FrameworkScores } from '@/lib/control-compliance';
import type { FrameworkEditorRequirement } from '@db';
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { ChevronDown, ChevronRight, Search } from '@trycompai/design-system/icons';
import { useParams, useRouter } from 'next/navigation';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useMemo, useState } from 'react';
import {
  areAllFamiliesExpanded,
  isFamilyExpanded,
  toggleAllFamilyExpansion,
  toggleFamilyExpansion,
} from './family-expansion-state';
import { FamilyFilterDropdown } from './FamilyFilterDropdown';
import {
  buildRequirementItems,
  getFamilyDisplayLabel,
  groupRequirementsByFamily,
  type RequirementFamilyGroup,
} from './framework-controls-shared';
import { GroupedRequirementRow } from './GroupedRequirementRow';
import { filterRequirementItems } from './table-filters';
import { RequirementTableFilters, useRequirementTableFilters } from './TableFilters';
import {
  REQUIREMENTS_TABLE_COLUMN_COUNT,
  REQUIREMENTS_TABLE_STYLE,
  RequirementsTableColumnGroup,
  RequirementsTableHeader,
} from './requirements-table-layout';

export function FrameworkRequirementsGrouped({
  requirementDefinitions,
  scores,
  descriptionLabel,
}: {
  requirementDefinitions: FrameworkEditorRequirement[];
  scores: FrameworkScores | null | undefined;
  descriptionLabel?: string;
}) {
  const { orgId, frameworkInstanceId } = useParams<{
    orgId: string;
    frameworkInstanceId: string;
  }>();
  const router = useRouter();

  const handleRowClick = useCallback(
    (requirementId: string) => {
      router.push(`/${orgId}/frameworks/${frameworkInstanceId}/requirements/${requirementId}`);
    },
    [orgId, frameworkInstanceId, router],
  );

  const [searchTerm, setSearchTerm] = useQueryState(
    'rq',
    parseAsString.withDefault('').withOptions({ shallow: true, throttleMs: 300 }),
  );
  const [familyFilterParam, setFamilyFilterParam] = useQueryState(
    'rfamilies',
    parseAsArrayOf(parseAsString, '|').withDefault([]).withOptions({ shallow: true }),
  );
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const tableFilters = useRequirementTableFilters();

  const selectedFamilyFilter = useMemo(() => new Set(familyFilterParam), [familyFilterParam]);

  const allItems = useMemo(
    () => buildRequirementItems(requirementDefinitions, scores),
    [requirementDefinitions, scores],
  );

  const filteredItems = useMemo(() => {
    const narrowed = filterRequirementItems({
      items: allItems,
      status: tableFilters.status,
      applicability: tableFilters.applicability,
    });
    if (!searchTerm.trim()) return narrowed;
    const lower = searchTerm.toLowerCase();
    return narrowed.filter(
      (item) =>
        item.name.toLowerCase().includes(lower) ||
        item.identifier?.toLowerCase().includes(lower) ||
        item.description?.toLowerCase().includes(lower),
    );
  }, [allItems, searchTerm, tableFilters.status, tableFilters.applicability]);

  const allGroups = useMemo(() => groupRequirementsByFamily(filteredItems), [filteredItems]);

  const groups = useMemo(() => {
    if (selectedFamilyFilter.size === 0) return allGroups;
    return allGroups.filter((g) => selectedFamilyFilter.has(g.family));
  }, [allGroups, selectedFamilyFilter]);

  const allFamilyNames = useMemo(() => allGroups.map((g) => g.family), [allGroups]);
  const familyCounts = useMemo(
    () => new Map(allGroups.map((g) => [g.family, g.items.length])),
    [allGroups],
  );

  const isSearching = searchTerm.trim().length > 0 || tableFilters.isActive;
  const visibleFamilyNames = useMemo(() => groups.map((g) => g.family), [groups]);
  const allExpanded = areAllFamiliesExpanded({
    expandedFamilies,
    familyNames: visibleFamilyNames,
  });

  const handleToggleFamily = (family: string) => {
    setExpandedFamilies((prev) => toggleFamilyExpansion({ expandedFamilies: prev, family }));
  };

  const handleToggleAll = () => {
    setExpandedFamilies((prev) =>
      toggleAllFamilyExpansion({
        expandedFamilies: prev,
        familyNames: visibleFamilyNames,
        shouldExpand: !allExpanded,
      }),
    );
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value || null);
  };

  const handleToggleFamilyFilter = (family: string) => {
    const next = new Set(selectedFamilyFilter);
    if (next.has(family)) next.delete(family);
    else next.add(family);
    setFamilyFilterParam(next.size > 0 ? [...next].sort() : null);
  };

  const handleClearFamilyFilter = () => {
    setFamilyFilterParam(null);
  };

  const getIsFamilyExpanded = (family: string) =>
    isFamilyExpanded({ expandedFamilies, family, isSearching });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="w-full max-w-sm">
          <InputGroup>
            <InputGroupAddon>
              <Search size={16} />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search requirements..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </InputGroup>
        </div>
        <FamilyFilterDropdown
          allFamilyNames={allFamilyNames}
          familyCounts={familyCounts}
          selectedFamilies={selectedFamilyFilter}
          onToggleFamily={handleToggleFamilyFilter}
          onClear={handleClearFamilyFilter}
        />
        <RequirementTableFilters filters={tableFilters} />
        {!isSearching && (
          <Button variant="ghost" onClick={handleToggleAll}>
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
      <Table variant="bordered" style={REQUIREMENTS_TABLE_STYLE}>
        <RequirementsTableColumnGroup />
        <RequirementsTableHeader descriptionLabel={descriptionLabel} />
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={REQUIREMENTS_TABLE_COLUMN_COUNT}>
                <Text size="sm" variant="muted">
                  No requirements found.
                </Text>
              </TableCell>
            </TableRow>
          ) : (
            groups.map((group) => (
              <RequirementFamilySection
                key={group.family}
                group={group}
                expanded={getIsFamilyExpanded(group.family)}
                onToggle={() => handleToggleFamily(group.family)}
                orgId={orgId}
                frameworkInstanceId={frameworkInstanceId}
                onRowClick={handleRowClick}
              />
            ))
          )}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}

function RequirementFamilySection({
  group,
  expanded,
  onToggle,
  orgId,
  frameworkInstanceId,
  onRowClick,
}: {
  group: RequirementFamilyGroup;
  expanded: boolean;
  onToggle: () => void;
  orgId: string;
  frameworkInstanceId: string;
  onRowClick: (requirementId: string) => void;
}) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <>
      <TableRow data-state="selected">
        <TableCell colSpan={REQUIREMENTS_TABLE_COLUMN_COUNT}>
          <button
            type="button"
            className="flex w-full items-center gap-2 py-1 text-left font-medium cursor-pointer"
            onClick={onToggle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle();
              }
            }}
            aria-expanded={expanded}
          >
            <ChevronIcon size={16} />
            <span>{getFamilyDisplayLabel(group.family)}</span>
            <span className="text-muted-foreground text-sm font-normal">
              ({group.items.length})
            </span>
          </button>
        </TableCell>
      </TableRow>
      {expanded &&
        group.items.map((item) => (
          <GroupedRequirementRow
            key={item.id}
            item={item}
            orgId={orgId}
            frameworkInstanceId={frameworkInstanceId}
            onRowClick={onRowClick}
          />
        ))}
    </>
  );
}
