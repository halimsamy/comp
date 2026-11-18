'use client';

import type { Audit } from '@/hooks/use-audits';
import { Badge, Button, Stack, Text } from '@trycompai/design-system';
import { ArrowRight, Edit } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { AUDIT_STATUS_LABELS, accessLabel, formatPeriod } from '../lib/audit-labels';
import { AuditProgressBar } from './AuditProgressBar';

/** One engagement: framework, firm, auditors, period, access and progress. */
export function AuditCard({
  audit,
  href,
  canEdit,
  onEdit,
}: {
  audit: Audit;
  href: string;
  canEdit: boolean;
  onEdit: (audit: Audit) => void;
}) {
  const auditors = audit.auditors.map((a) => a.name || a.email).join(', ');
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Stack gap="1">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="xs" variant="muted" weight="medium">
              {audit.frameworkName}
            </Text>
            <Badge variant={audit.status === 'completed' ? 'secondary' : 'accent'}>
              {AUDIT_STATUS_LABELS[audit.status]}
            </Badge>
          </div>
          <Text size="lg" weight="semibold">
            {audit.title}
          </Text>
          <Text size="sm" variant="muted">
            {audit.firmName ? `${audit.firmName} · ` : ''}Audit period {formatPeriod(audit)}
          </Text>
        </Stack>
        <div className="flex shrink-0 gap-2">
          {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Edit size={16} />}
              onClick={() => onEdit(audit)}
            >
              Edit
            </Button>
          ) : null}
          <Link href={href}>
            <Button size="sm" iconRight={<ArrowRight size={16} />}>
              Open audit
            </Button>
          </Link>
        </div>
      </div>
      <AuditProgressBar progress={audit.progress} />
      <div className="flex flex-col gap-1 border-t border-border pt-3 sm:flex-row sm:justify-between">
        <Text size="xs" variant="muted">
          {auditors ? `Auditors: ${auditors}` : 'No auditors assigned yet'}
        </Text>
        <Text size="xs" variant="muted">
          {accessLabel(audit)}
          {audit.openRequests > 0 ? ` · ${audit.openRequests} open requests` : ''}
        </Text>
      </div>
    </div>
  );
}
