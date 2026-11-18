'use client';

import { IsmsSummaryRow } from '@/app/(app)/[orgId]/documents/isms/components/shared';
import type { Asset } from '@/hooks/use-assets';
import { usePermissions } from '@/hooks/use-permissions';
import { useVulnerabilities, type Vulnerability } from '@/hooks/use-vulnerabilities';
import {
  DataTableFilters,
  DataTableHeader,
  DataTableSearch,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  PageHeaderDescription,
  Stack,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { CheckmarkFilled, Misuse, Time, WarningAltFilled } from '@trycompai/design-system/icons';
import { useState } from 'react';
import type { MemberOption } from '../../assets/components/AssetFormFields';
import { FilterSelect, optionsFrom } from '../../assets/components/FilterSelect';
import { CDE_SCOPE_LABELS } from '../../assets/lib/asset-labels';
import {
  DEFAULT_VULNERABILITY_FILTERS,
  matchesVulnerability,
  slaCounts,
  VIEW_MATCHERS,
  type VulnerabilityFilters,
  type VulnerabilityView,
} from '../lib/vulnerability-filters';
import { SEVERITY_LABELS, SLA_LABELS, SOURCE_LABELS } from '../lib/vulnerability-labels';
import { CreateVulnerabilitySheet } from './CreateVulnerabilitySheet';
import { ImportVulnerabilitiesDialog } from './ImportVulnerabilitiesDialog';
import { VulnerabilitiesHeaderActions } from './VulnerabilitiesHeaderActions';
import { VulnerabilitiesTable } from './VulnerabilitiesTable';
import { VulnerabilitySheet } from './VulnerabilitySheet';

const VIEWS: { value: VulnerabilityView; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'resolved', label: 'Resolved' },
];

/** Findings from integrations, ASV scans, pentests and manual entry, tracked against SLAs. */
export function VulnerabilitiesClient({
  initialVulnerabilities,
  assets,
  memberOptions,
}: {
  initialVulnerabilities?: Vulnerability[];
  assets: Pick<Asset, 'id' | 'name'>[];
  memberOptions: MemberOption[];
}) {
  const { hasPermission } = usePermissions();
  const { vulnerabilities, isLoading, error, create, update, importCsv, sync } = useVulnerabilities(
    {
      initialData: initialVulnerabilities,
    },
  );
  const [view, setView] = useState<VulnerabilityView>('open');
  const [filters, setFilters] = useState<VulnerabilityFilters>(DEFAULT_VULNERABILITY_FILTERS);
  const [selected, setSelected] = useState<Vulnerability | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const setFilter =
    <K extends keyof VulnerabilityFilters>(key: K) =>
    (value: VulnerabilityFilters[K]) =>
      setFilters((current) => ({ ...current, [key]: value }));
  const inView = vulnerabilities.filter(VIEW_MATCHERS[view]);
  const visible = inView.filter((vulnerability) =>
    matchesVulnerability({ vulnerability, filters }),
  );
  const counts = slaCounts(vulnerabilities);
  const openCriticalHigh = vulnerabilities.filter(
    (v) => v.status === 'open' && (v.severity === 'critical' || v.severity === 'high'),
  ).length;

  const header = (
    <PageHeader
      title="Vulnerabilities"
      actions={
        <VulnerabilitiesHeaderActions
          onSync={sync}
          onImport={() => setIsImportOpen(true)}
          onCreate={() => setIsCreateOpen(true)}
        />
      }
    >
      <PageHeaderDescription>
        Findings from your scanners, ASV scans and penetration tests with a remediation SLA from
        first detection: critical and high within 30 days (PCI DSS 6.3.3, 11.3.1), medium 90, low
        180 (ISO 27001 A.8.8).
      </PageHeaderDescription>
    </PageHeader>
  );

  if (isLoading || (error && vulnerabilities.length === 0)) {
    return (
      <Stack gap="6">
        {header}
        <Text size="sm" variant={error ? 'destructive' : 'muted'}>
          {error
            ? 'Could not load vulnerabilities. Refresh the page to try again.'
            : 'Loading vulnerabilities…'}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="6">
      {header}
      <IsmsSummaryRow
        stats={[
          {
            label: 'Overdue',
            value: counts.overdue,
            icon: Misuse,
            tone: counts.overdue > 0 ? 'warning' : 'success',
          },
          {
            label: 'Due within 14 days',
            value: counts.due_soon,
            icon: Time,
            tone: counts.due_soon > 0 ? 'warning' : 'default',
          },
          { label: 'Due later', value: counts.due_later, icon: CheckmarkFilled },
          {
            label: 'Open critical & high',
            value: openCriticalHigh,
            icon: WarningAltFilled,
            tone: openCriticalHigh > 0 ? 'warning' : 'success',
          },
        ]}
      />
      {vulnerabilities.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No vulnerabilities tracked yet</EmptyTitle>
            <EmptyDescription>
              Connect GitHub (Dependabot), Aikido or AWS (Inspector via Security Hub) and refresh,
              import your quarterly ASV scan or penetration test CSV, or log a finding by hand.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Stack gap="4">
          <div className="overflow-x-auto">
            <Tabs value={view} onValueChange={(next) => setView(next as VulnerabilityView)}>
              <TabsList variant="underline">
                {VIEWS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label} ({vulnerabilities.filter(VIEW_MATCHERS[item.value]).length})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <DataTableHeader>
            <DataTableSearch
              placeholder="Search title, CVE or asset"
              value={filters.search}
              onChange={setFilter('search')}
            />
            <DataTableFilters>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                <FilterSelect
                  label="Severity"
                  value={filters.severity}
                  options={optionsFrom({ allLabel: 'All severities', labels: SEVERITY_LABELS })}
                  onChange={setFilter('severity')}
                />
                <FilterSelect
                  label="Source"
                  value={filters.source}
                  options={optionsFrom({ allLabel: 'All sources', labels: SOURCE_LABELS })}
                  onChange={setFilter('source')}
                />
                <FilterSelect
                  label="SLA status"
                  value={filters.sla}
                  options={optionsFrom({ allLabel: 'All SLA statuses', labels: SLA_LABELS })}
                  onChange={setFilter('sla')}
                />
                <FilterSelect
                  label="PCI scope"
                  value={filters.cdeScope}
                  options={optionsFrom({ allLabel: 'All scopes', labels: CDE_SCOPE_LABELS })}
                  onChange={setFilter('cdeScope')}
                />
              </div>
            </DataTableFilters>
          </DataTableHeader>
          {visible.length === 0 ? (
            <Text size="sm" variant="muted">
              {inView.length === 0 ? 'Nothing here.' : 'No vulnerabilities match these filters.'}
            </Text>
          ) : (
            <VulnerabilitiesTable vulnerabilities={visible} onOpen={setSelected} />
          )}
        </Stack>
      )}
      <VulnerabilitySheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        vulnerability={selected}
        memberOptions={memberOptions}
        canEdit={hasPermission('integration', 'update')}
        onSubmit={(payload) =>
          selected ? update({ id: selected.id, payload }) : Promise.resolve()
        }
      />
      <CreateVulnerabilitySheet
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        assets={assets}
        onSubmit={create}
      />
      <ImportVulnerabilitiesDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImport={importCsv}
      />
    </Stack>
  );
}
