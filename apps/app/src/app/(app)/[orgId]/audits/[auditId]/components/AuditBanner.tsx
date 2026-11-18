import type { Audit } from '@/hooks/use-audits';
import { Badge, Text } from '@trycompai/design-system';
import { AUDIT_STATUS_LABELS, accessLabel, formatPeriod } from '../../lib/audit-labels';

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

/** Audit context bar (Vanta's auditor view header): name, status and period, firm and auditors. */
export function AuditBanner({ audit }: { audit: Audit }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-primary/10 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <Text size="xs" variant="muted" weight="medium">
          {audit.frameworkName}
        </Text>
        <div className="truncate">
          <Text size="lg" weight="semibold">
            {audit.title}
          </Text>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent">{AUDIT_STATUS_LABELS[audit.status]}</Badge>
        <Text size="sm">{formatPeriod(audit)}</Text>
      </div>
      <div className="flex flex-col gap-1 lg:items-end">
        <div className="flex items-center gap-2">
          {audit.firmName ? <Text size="sm">{audit.firmName}</Text> : null}
          <div className="flex -space-x-1.5">
            {audit.auditors.map((auditor) => (
              <span
                key={auditor.memberId}
                title={auditor.name || auditor.email}
                className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold"
              >
                {initials(auditor.name || auditor.email)}
              </span>
            ))}
          </div>
        </div>
        <Text size="xs" variant="muted">
          {accessLabel(audit)}
        </Text>
      </div>
    </div>
  );
}
