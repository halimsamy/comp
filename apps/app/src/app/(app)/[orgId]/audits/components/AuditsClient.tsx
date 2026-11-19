'use client';

import { useAudits, type Audit } from '@/hooks/use-audits';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  PageHeader,
  PageHeaderDescription,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { isActiveAudit } from '../lib/audit-labels';
import { AuditCard } from './AuditCard';
import type { Option } from './AuditFormFields';
import { AuditFormSheet } from './AuditFormSheet';
import { FindingsTab } from './findings/FindingsTab';
import { InternalAuditsSection } from './InternalAuditsSection';

type Tab = 'active' | 'completed';
type PageTab = 'audits' | 'internal' | 'findings';

/**
 * Audits: external engagements (active / completed, with progress), the ISMS
 * internal audits, and Findings, the one issue register (#171).
 */
export function AuditsClient({
  orgId,
  initialAudits,
  frameworks,
  auditors,
}: {
  orgId: string;
  initialAudits?: Audit[];
  frameworks: Option[];
  auditors: Option[];
}) {
  const { hasPermission } = usePermissions();
  const { audits, isLoading, error, create, update, remove } = useAudits({
    initialData: initialAudits,
  });
  const [tab, setTab] = useState<Tab>('active');
  const [sheet, setSheet] = useState<{ open: boolean; audit: Audit | null }>({
    open: false,
    audit: null,
  });
  const canCreate = hasPermission('audit', 'create');
  const canEdit = hasPermission('audit', 'update');
  const canReadFindings = hasPermission('finding', 'read');
  const canCreateFinding = hasPermission('finding', 'create');
  const canReadIsms = hasPermission('evidence', 'read');
  const [findingSheetOpen, setFindingSheetOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');
  const pageTab: PageTab =
    tabParam === 'findings' && canReadFindings
      ? 'findings'
      : tabParam === 'internal' && canReadIsms
        ? 'internal'
        : 'audits';
  const handlePageTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (value === 'audits') params.delete('tab');
    else params.set('tab', value);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const active = audits.filter(isActiveAudit);
  const completed = audits.filter((a) => !isActiveAudit(a));
  const visible = tab === 'active' ? active : completed;

  const headerAction =
    pageTab === 'findings' ? (
      canCreateFinding ? (
        <Button iconLeft={<Add size={16} />} onClick={() => setFindingSheetOpen(true)}>
          Add finding
        </Button>
      ) : undefined
    ) : pageTab === 'audits' && canCreate ? (
      <Button iconLeft={<Add size={16} />} onClick={() => setSheet({ open: true, audit: null })}>
        Add audit
      </Button>
    ) : undefined;

  const header = (
    <PageHeader
      title="Audits"
      actions={headerAction}
      tabs={
        <TabsList variant="underline">
          <TabsTrigger value="audits">External audits</TabsTrigger>
          {canReadIsms ? <TabsTrigger value="internal">Internal audits</TabsTrigger> : null}
          {canReadFindings ? <TabsTrigger value="findings">Findings</TabsTrigger> : null}
        </TabsList>
      }
    >
      <PageHeaderDescription>
        Your ISO 27001 certification and PCI DSS assessments. Auditors review each requirement's
        evidence for the audit period, ask questions and request more evidence here.
      </PageHeaderDescription>
    </PageHeader>
  );

  const body = () => {
    if (error && audits.length === 0) {
      return (
        <Text size="sm" variant="destructive">
          Could not load audits. Refresh the page to try again.
        </Text>
      );
    }
    if (isLoading) {
      return (
        <Text size="sm" variant="muted">
          Loading audits…
        </Text>
      );
    }
    if (audits.length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No audits yet</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? 'Add your certification body or QSA engagement with its audit period. Invite the auditors under People with the Auditor role, then assign them to the audit.'
                : 'When your team adds an audit and assigns you to it, it shows up here.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <Stack gap="4">
        <Tabs
          value={tab}
          onValueChange={(next) => setTab(next === 'completed' ? 'completed' : 'active')}
        >
          <TabsList>
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        {visible.length === 0 ? (
          <Text size="sm" variant="muted">
            {tab === 'active' ? 'No audits in progress.' : 'No completed audits yet.'}
          </Text>
        ) : (
          visible.map((audit) => (
            <AuditCard
              key={audit.id}
              audit={audit}
              href={`/${orgId}/audits/${audit.id}`}
              canEdit={canEdit}
              onEdit={(selected) => setSheet({ open: true, audit: selected })}
            />
          ))
        )}
      </Stack>
    );
  };

  return (
    <Tabs value={pageTab} onValueChange={handlePageTabChange}>
      <Stack gap="6">
        {header}
        <TabsContent value="audits">{body()}</TabsContent>
        {canReadIsms ? (
          <TabsContent value="internal">
            <InternalAuditsSection orgId={orgId} />
          </TabsContent>
        ) : null}
        {canReadFindings ? (
          <TabsContent value="findings">
            <FindingsTab
              organizationId={orgId}
              createOpen={findingSheetOpen}
              onCreateOpenChange={setFindingSheetOpen}
            />
          </TabsContent>
        ) : null}
        {canCreate || canEdit ? (
          <AuditFormSheet
            open={sheet.open}
            onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
            audit={sheet.audit}
            frameworks={frameworks}
            auditors={auditors}
            onSubmit={(payload) =>
              sheet.audit ? update({ id: sheet.audit.id, payload }) : create(payload)
            }
            onDelete={(audit) => remove(audit.id)}
          />
        ) : null}
      </Stack>
    </Tabs>
  );
}
