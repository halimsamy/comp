'use client';

import type { ComplianceItem, ComplianceStatus } from '@/hooks/use-member-compliance';
import { useMemberCompliance } from '@/hooks/use-member-compliance';
import { Badge, Section, Text } from '@trycompai/design-system';
import {
  Checkmark,
  ChevronRight,
  CircleDash,
  Misuse,
  Time,
  WarningAlt,
} from '@trycompai/design-system/icons';

/** Which member-page tab each row opens. */
const ROW_TAB: Record<string, string> = {
  policies: 'policies',
  training: 'training',
  role_training: 'training',
  device: 'device',
  background_check: 'background-check',
  onboarding: 'onboarding',
  offboarding: 'offboarding',
};

const STATUS: Record<
  ComplianceStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'accent'; icon: React.ReactNode; tone: string }
> = {
  complete: { label: 'Complete', variant: 'accent', icon: <Checkmark size={14} />, tone: 'bg-primary text-primary-foreground' },
  in_progress: { label: 'In progress', variant: 'outline', icon: <Time size={14} />, tone: 'border border-primary text-primary' },
  incomplete: { label: 'Needs attention', variant: 'outline', icon: <CircleDash size={14} />, tone: 'border text-muted-foreground' },
  overdue: { label: 'Overdue', variant: 'destructive', icon: <WarningAlt size={14} />, tone: 'bg-destructive/10 text-destructive' },
  expired: { label: 'Expired', variant: 'destructive', icon: <Misuse size={14} />, tone: 'bg-destructive/10 text-destructive' },
  not_required: { label: 'Not required', variant: 'secondary', icon: <CircleDash size={14} />, tone: 'border border-dashed text-muted-foreground' },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function rowDates(item: ComplianceItem): string | null {
  if (item.status === 'complete' && item.completedAt) {
    const done = `Completed ${formatDate(item.completedAt)}`;
    return item.expiresAt ? `${done} · renews ${formatDate(item.expiresAt)}` : done;
  }
  if (item.dueDate) return `${item.status === 'overdue' ? 'Was due' : 'Due'} ${formatDate(item.dueDate)}`;
  return null;
}

interface MemberComplianceOverviewProps {
  memberId: string;
  availableTabs: string[];
  onOpenTab: (tab: string) => void;
}

export function MemberComplianceOverview({ memberId, availableTabs, onOpenTab }: MemberComplianceOverviewProps) {
  const { compliance, isLoading, error } = useMemberCompliance(memberId);

  if (isLoading) {
    return (
      <Section title="Compliance checklist">
        <Text variant="muted">Loading checklist...</Text>
      </Section>
    );
  }
  if (error || !compliance) {
    return (
      <Section title="Compliance checklist">
        <Text variant="muted">Could not load this person&apos;s checklist. Refresh to try again.</Text>
      </Section>
    );
  }

  const { completedItems, totalItems, items } = compliance;
  const pct = totalItems === 0 ? 100 : Math.round((completedItems / totalItems) * 100);
  const description =
    completedItems === totalItems
      ? 'Everything this person must do for ISO 27001 and PCI DSS is done.'
      : `${completedItems} of ${totalItems} requirements complete`;

  return (
    <Section title="Compliance checklist" description={description}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Compliance progress"
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <ul className="divide-y overflow-hidden rounded-lg border">
          {items.map((item) => {
            const status = STATUS[item.status];
            const tab = ROW_TAB[item.key];
            const canOpen = !!tab && availableTabs.includes(tab);
            const dates = rowDates(item);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => canOpen && onOpenTab(tab)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors enabled:hover:bg-muted/50 disabled:cursor-default"
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${status.tone}`}>
                    {status.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm">{item.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.detail}
                      {dates ? ` · ${dates}` : ''}
                    </span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </span>
                  {canOpen && <ChevronRight size={16} className="shrink-0 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
