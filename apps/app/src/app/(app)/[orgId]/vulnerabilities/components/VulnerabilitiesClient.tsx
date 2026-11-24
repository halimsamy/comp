'use client';

import { IsmsSummaryRow } from '@/app/(app)/[orgId]/documents/isms/components/shared';
import type { Asset } from '@/hooks/use-assets';
import { usePermissions } from '@/hooks/use-permissions';
import { useVulnerabilities, type Vulnerability } from '@/hooks/use-vulnerabilities';
import { useSlaPolicy } from '@/hooks/use-vulnerability-program';
import {
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
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { MemberOption } from '../../assets/components/AssetFormFields';
import { slaCounts, VIEW_MATCHERS, type VulnerabilityView } from '../lib/vulnerability-filters';
import { slaDaysFrom } from '../lib/vulnerability-labels';
import { CreateVulnerabilitySheet } from './CreateVulnerabilitySheet';
import { ImportVulnerabilitiesDialog } from './ImportVulnerabilitiesDialog';
import { ScansTab } from './ScansTab';
import { SlaPolicyTab } from './SlaPolicyTab';
import { VulnerabilitiesHeaderActions } from './VulnerabilitiesHeaderActions';
import { VulnerabilityListView } from './VulnerabilityListView';
import { VulnerabilitySheet } from './VulnerabilitySheet';

type Tab = VulnerabilityView | 'scans' | 'sla';

const VIEWS: { value: VulnerabilityView; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'accepted', label: 'False positive / accepted' },
  { value: 'resolved', label: 'Resolved' },
];

/** Findings from integrations, scans, pentests and manual entry, tracked against the org SLA. */
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
    { initialData: initialVulnerabilities },
  );
  const { policy } = useSlaPolicy();
  const searchParams = useSearchParams();
  // Deep link (/vulnerabilities?tab=scans) from evidence rules and the retired Documents form.
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams?.get('tab');
    return requested === 'scans' || requested === 'sla' ? requested : 'open';
  });
  // Deep link from owner and SLA emails (/vulnerabilities?id=ipf_…) opens that finding.
  const [selectedId, setSelectedId] = useState<string | null>(
    () => searchParams?.get('id') ?? null,
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const selected = vulnerabilities.find((v) => v.id === selectedId) ?? null;
  const days = slaDaysFrom(policy);

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
        {`Findings from your scanners, ASV scans and penetration tests with a remediation SLA from first detection: critical within ${days.critical} days, high ${days.high}, medium ${days.medium}, low ${days.low} (PCI DSS 6.3.3, 11.3; ISO 27001 A.8.8).`}
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

  const isListTab = tab !== 'scans' && tab !== 'sla';
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
      <div className="min-w-0 overflow-x-auto">
        <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)}>
          <TabsList variant="underline">
            {VIEWS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label} ({vulnerabilities.filter(VIEW_MATCHERS[item.value]).length})
              </TabsTrigger>
            ))}
            <TabsTrigger value="scans">Scans</TabsTrigger>
            <TabsTrigger value="sla">SLA policy</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === 'scans' ? <ScansTab /> : null}
      {tab === 'sla' ? <SlaPolicyTab canEdit={hasPermission('integration', 'update')} /> : null}
      {isListTab && vulnerabilities.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No vulnerabilities tracked yet</EmptyTitle>
            <EmptyDescription>
              Connect GitHub (Dependabot), Aikido or AWS (Inspector via Security Hub) and refresh,
              import your quarterly ASV scan, internal scan or penetration test, or log a finding by
              hand.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {isListTab && vulnerabilities.length > 0 ? (
        <VulnerabilityListView
          vulnerabilities={vulnerabilities.filter(VIEW_MATCHERS[tab])}
          onOpen={(v) => setSelectedId(v.id)}
        />
      ) : null}
      <VulnerabilitySheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
        vulnerability={selected}
        memberOptions={memberOptions}
        assets={assets}
        canEdit={hasPermission('integration', 'update')}
        onSubmit={(payload) =>
          selected ? update({ id: selected.id, payload }) : Promise.resolve()
        }
      />
      <CreateVulnerabilitySheet
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        assets={assets}
        slaDays={days}
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
