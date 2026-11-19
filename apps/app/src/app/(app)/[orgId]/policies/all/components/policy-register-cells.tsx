'use client';

import { Badge, HStack, Text } from '@trycompai/design-system';
import { ArrowDown, ArrowUp, ArrowsVertical } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { PolicyStatusBadge } from '../../[policyId]/components/PolicyStatusBadge';
import { isArchivedPolicy } from '../../lib/policy-archive-state';
import { stageOf, type PolicyRegisterRow, type RegisterSort } from '../../lib/policy-register';
import type { PolicyTailoringStatus } from './policy-tailoring-context';

const day = (value: Date | string | null | undefined) =>
  value ? format(new Date(value), 'MMM d, yyyy') : null;
const personName = (person: PolicyRegisterRow['assignee']) =>
  person?.user.name || person?.user.email || null;

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" variant="muted">
      {children}
    </Text>
  );
}

export function SortableHeader({
  label,
  column,
  sort,
  direction,
  onSort,
}: {
  label: string;
  column: RegisterSort;
  sort: RegisterSort;
  direction: 'asc' | 'desc';
  onSort: (column: RegisterSort) => void;
}) {
  const icon =
    sort !== column ? (
      <ArrowsVertical size={14} className="text-muted-foreground opacity-50" />
    ) : direction === 'asc' ? (
      <ArrowUp size={14} />
    ) : (
      <ArrowDown size={14} />
    );
  return (
    <button
      type="button"
      className="flex items-center gap-1 whitespace-nowrap"
      onClick={() => onSort(column)}
    >
      <span>{label}</span>
      {icon}
    </button>
  );
}

export function StatusCell({
  policy,
  tailoring,
}: {
  policy: PolicyRegisterRow;
  tailoring: PolicyTailoringStatus | undefined;
}) {
  if (tailoring && tailoring !== 'completed') {
    const label =
      tailoring === 'processing' ? 'Tailoring' : tailoring === 'queued' ? 'Queued' : 'Preparing';
    return (
      <HStack gap="xs" align="center">
        <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <Text size="sm" variant="primary">
          {label}
        </Text>
      </HStack>
    );
  }
  return <PolicyStatusBadge stage={stageOf(policy)} isArchived={isArchivedPolicy(policy)} />;
}

export function VersionCell({ policy }: { policy: PolicyRegisterRow }) {
  const version = policy.lastPublishedAt ? policy.currentVersion?.version : null;
  return <Muted>{version ? `v${version}` : '—'}</Muted>;
}

export function PersonCell({ person }: { person: PolicyRegisterRow['assignee'] }) {
  const name = personName(person);
  if (!name) return <Badge variant="outline">Unassigned</Badge>;
  return (
    <span className="block max-w-[10rem] truncate text-sm" title={name}>
      {name}
    </span>
  );
}

export function LastApprovedCell({ policy }: { policy: PolicyRegisterRow }) {
  return <Muted>{day(policy.currentVersion?.approvedAt ?? policy.lastPublishedAt) ?? '—'}</Muted>;
}

export function NextReviewCell({ policy }: { policy: PolicyRegisterRow }) {
  const date = day(policy.reviewDate);
  if (!date) return <Muted>Not set</Muted>;
  if (stageOf(policy) !== 'review_due') return <Muted>{date}</Muted>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Text size="sm">{date}</Text>
      <span className="rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
        Overdue
      </span>
    </span>
  );
}

export function AcknowledgedCell({ policy }: { policy: PolicyRegisterRow }) {
  const ack = policy.acknowledgement;
  if (!ack || !policy.isRequiredToSign || !policy.lastPublishedAt) return <Muted>—</Muted>;
  return (
    <span className="whitespace-nowrap text-sm">
      {ack.acknowledged}/{ack.total}
    </span>
  );
}

export function FrameworksCell({ frameworks }: { frameworks?: string[] }) {
  if (!frameworks?.length) return <Muted>—</Muted>;
  return (
    <div className="flex flex-wrap gap-1">
      {frameworks.map((name) => (
        <Badge key={name} variant="secondary">
          {name}
        </Badge>
      ))}
    </div>
  );
}
