'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import {
  extractOrgFrameworkTypes,
  FINDING_SEVERITY_CONFIG,
  FINDING_STATUS_CONFIG,
  FINDING_TYPE_LABELS,
  useOrganizationFindings,
  type Finding,
} from '@/hooks/use-findings-api';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate } from '@/lib/format';
import type { FindingSeverity, FindingStatus, FindingType } from '@db';
import {
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { WarningAlt } from '@trycompai/design-system/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CreateFindingSheet } from '@/app/(app)/[orgId]/overview/components/CreateFindingSheet';
import { FindingDetailSheet } from '@/app/(app)/[orgId]/overview/components/FindingDetailSheet';
import {
  SEVERITY_OPTIONS,
  SEVERITY_VARIANT,
  STATUS_OPTIONS,
  STATUS_VARIANT,
  targetLabel,
} from './finding-labels';
import { FindingsFilters } from './FindingsFilters';

interface FindingsTabProps {
  organizationId: string;
  initialFindings?: Finding[];
  /** Controlled open state for the Create Finding sheet (owned by the page header). */
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}

export function FindingsTab({
  organizationId,
  initialFindings,
  createOpen: createOpenProp,
  onCreateOpenChange,
}: FindingsTabProps) {
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const createOpen = createOpenProp ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;

  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FindingStatus | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | 'all'>('all');
  const [frameworkFilter, setFrameworkFilter] = useState<FindingType | 'all'>('all');

  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('finding', 'create');

  const router = useRouter();
  const searchParams = useSearchParams();
  const openFindingId = searchParams?.get('open') ?? null;

  const { data, mutate } = useOrganizationFindings(
    {},
    initialFindings
      ? { fallbackData: { data: initialFindings, status: 200 } }
      : {},
  );
  const findings: Finding[] = Array.isArray(data?.data) ? data.data : [];

  // Mirror the Create Finding form: the framework filter must offer every
  // framework the org has actually enabled — not a hardcoded SOC 2 / ISO 27001
  // pair — so findings logged against ISO 42001, HIPAA, etc. are filterable.
  const { data: frameworksData } = useApiSWR<unknown>(
    '/v1/frameworks?includeScores=false',
    { refreshInterval: 0 },
  );
  const frameworkOptions = useMemo<
    { value: FindingType | 'all'; label: string }[]
  >(
    () => [
      { value: 'all', label: 'All frameworks' },
      ...extractOrgFrameworkTypes(frameworksData).map((type) => ({
        value: type,
        label: FINDING_TYPE_LABELS[type],
      })),
    ],
    [frameworksData],
  );

  // Support deep links (e.g. emails + in-app notifications) that land on
  // `/audits?tab=findings&open=<id>`. Auto-open the matching finding's sheet
  // once we've loaded the list, then strip the query param so a page
  // refresh doesn't reopen it.
  useEffect(() => {
    if (!openFindingId) return;
    const match = findings.find((f) => f.id === openFindingId);
    if (!match) return;
    setSelectedFinding((current) => current ?? match);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('open');
    const query = params.toString();
    router.replace(query ? `?${query}` : '?', { scroll: false });
  }, [openFindingId, findings, router, searchParams]);

  const filtered = useMemo(() => {
    let result = [...findings];

    if (statusFilter !== 'all') {
      result = result.filter((f) => f.status === statusFilter);
    }
    if (severityFilter !== 'all') {
      result = result.filter((f) => f.severity === severityFilter);
    }
    if (frameworkFilter !== 'all') {
      result = result.filter((f) => f.type === frameworkFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.content.toLowerCase().includes(q) ||
          targetLabel(f).toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });

    return result;
  }, [findings, statusFilter, severityFilter, frameworkFilter, searchQuery]);

  const hasAnyFinding = findings.length > 0;

  return (
    <Stack gap="md">
      {hasAnyFinding && (
        <FindingsFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          severityFilter={severityFilter}
          onSeverityChange={setSeverityFilter}
          frameworkFilter={frameworkFilter}
          onFrameworkChange={setFrameworkFilter}
          frameworkOptions={frameworkOptions}
        />
      )}

      {!hasAnyFinding ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WarningAlt size={24} />
            </EmptyMedia>
            <EmptyTitle>No findings yet</EmptyTitle>
            <EmptyDescription>
              Findings are raised by your auditor when something in your compliance
              program needs attention. They&apos;ll show up here so your team can act
              on them.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No findings match your filters</EmptyTitle>
            <EmptyDescription>
              Try clearing the search or changing the status/severity filter.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table variant="bordered">
          <TableHeader>
            <TableRow>
              <TableHead>Target</TableHead>
              <TableHead>Finding</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((f) => (
              <TableRow
                key={f.id}
                onClick={() => setSelectedFinding(f)}
                style={{ cursor: 'pointer' }}
              >
                <TableCell style={{ maxWidth: 360, width: 360 }}>
                  <span
                    className="block truncate text-sm text-muted-foreground"
                    style={{ maxWidth: 360 }}
                    title={targetLabel(f)}
                  >
                    {targetLabel(f)}
                  </span>
                </TableCell>
                <TableCell style={{ maxWidth: 360, width: 360 }}>
                  <span
                    className="block truncate text-sm font-medium"
                    style={{ maxWidth: 360 }}
                    title={f.content}
                  >
                    {f.content}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={SEVERITY_VARIANT[f.severity]}>
                    {FINDING_SEVERITY_CONFIG[f.severity].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[f.status]}>
                    {FINDING_STATUS_CONFIG[f.status].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Text size="sm" variant="muted">
                    {formatDate(f.updatedAt)}
                  </Text>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canCreate && (
        <CreateFindingSheet
          organizationId={organizationId}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={() => {
            void mutate();
          }}
        />
      )}

      <FindingDetailSheet
        finding={selectedFinding}
        organizationId={organizationId}
        open={selectedFinding !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedFinding(null);
        }}
        onSaved={() => {
          void mutate();
        }}
        onDeleted={() => {
          void mutate();
        }}
      />
    </Stack>
  );
}
