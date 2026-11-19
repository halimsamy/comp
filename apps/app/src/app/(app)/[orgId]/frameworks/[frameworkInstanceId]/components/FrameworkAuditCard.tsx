'use client';

import { AuditFormSheet } from '@/app/(app)/[orgId]/audits/components/AuditFormSheet';
import { AUDIT_STATUS_LABELS, formatPeriod, isActiveAudit } from '@/app/(app)/[orgId]/audits/lib/audit-labels';
import { useApiSWR } from '@/hooks/use-api-swr';
import { useAudits } from '@/hooks/use-audits';
import { usePermissions } from '@/hooks/use-permissions';
import { Badge, Button, Card, Text } from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState } from 'react';

type PeopleResponse = {
  data: { id: string; role: string; deactivated: boolean; user: { name: string | null; email: string } | null }[];
};

/** The framework's open audit (status, period, review readiness), or a "Plan audit" shortcut. */
export function FrameworkAuditCard({
  orgId,
  frameworkInstanceId,
  frameworkName,
}: {
  orgId: string;
  frameworkInstanceId: string;
  frameworkName: string;
}) {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('audit', 'read');
  const canCreate = hasPermission('audit', 'create');
  const [open, setOpen] = useState(false);
  const { audits, isLoading, error, create, remove } = useAudits();
  const people = useApiSWR<PeopleResponse>('/v1/people', { enabled: open });

  if (!canRead || isLoading || error) return null;
  const audit = audits.find((a) => a.frameworkInstanceId === frameworkInstanceId && isActiveAudit(a));

  if (audit) {
    const { accepted, total } = audit.progress;
    return (
      <Card width="full" size="sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Text size="sm" weight="medium">{audit.title}</Text>
              <Badge variant="secondary">{AUDIT_STATUS_LABELS[audit.status]}</Badge>
            </div>
            <Text size="xs" variant="muted">
              {`${formatPeriod(audit)} · ${accepted}/${total} requirements accepted${audit.openRequests > 0 ? ` · ${audit.openRequests} open requests` : ''}`}
            </Text>
          </div>
          <Link href={`/${orgId}/audits/${audit.id}`} className="shrink-0 text-sm text-primary hover:underline">
            Open audit
          </Link>
        </div>
      </Card>
    );
  }

  if (!canCreate) return null;
  const auditors = (people.data?.data?.data ?? [])
    .filter((p) => !p.deactivated && p.role.split(',').some((r) => r.trim() === 'auditor'))
    .map((p) => ({ id: p.id, name: p.user?.name || p.user?.email || 'Unknown' }));

  return (
    <Card width="full" size="sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Text size="sm" variant="muted">
          No audit planned for this framework.
        </Text>
        <div className="shrink-0">
          <Button size="sm" variant="outline" iconLeft={<Add size={16} />} onClick={() => setOpen(true)}>
            Plan audit
          </Button>
        </div>
      </div>
      <AuditFormSheet
        open={open}
        onOpenChange={setOpen}
        audit={null}
        frameworks={[{ id: frameworkInstanceId, name: frameworkName }]}
        auditors={auditors}
        defaultFrameworkInstanceId={frameworkInstanceId}
        onSubmit={create}
        onDelete={(a) => remove(a.id)}
      />
    </Card>
  );
}
