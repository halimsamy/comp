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
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { isActiveAudit } from '../lib/audit-labels';
import { AuditCard } from './AuditCard';
import type { Option } from './AuditFormFields';
import { AuditFormSheet } from './AuditFormSheet';

type Tab = 'active' | 'completed';

/** Audits list: active / completed engagements with progress, plus add and edit. */
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

  const active = audits.filter(isActiveAudit);
  const completed = audits.filter((a) => !isActiveAudit(a));
  const visible = tab === 'active' ? active : completed;

  const header = (
    <PageHeader
      title="Audits"
      actions={
        canCreate ? (
          <Button iconLeft={<Add size={16} />} onClick={() => setSheet({ open: true, audit: null })}>
            Add audit
          </Button>
        ) : undefined
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
        <Tabs value={tab} onValueChange={(next) => setTab(next === 'completed' ? 'completed' : 'active')}>
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
    <Stack gap="6">
      {header}
      {body()}
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
  );
}
