'use client';

import { getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage, Text } from '@trycompai/design-system';
import { format } from 'date-fns';
import type { ReactNode } from 'react';
import type { PolicyVersionWithPublisher } from '../hooks/usePolicyVersions';

export type VersionState = 'published' | 'pending' | 'rejected' | 'draft';

const STATE_BADGE: Record<VersionState, { label: string; className: string }> = {
  published: { label: 'Published', className: 'border-primary/30 bg-primary/10 text-primary' },
  pending: { label: 'Pending approval', className: 'border-warning/40 bg-warning/10 text-warning' },
  rejected: {
    label: 'Rejected',
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
  draft: { label: 'Draft', className: 'border-border bg-muted text-muted-foreground' },
};

const CARD_CLASS: Record<VersionState, string> = {
  published: 'border-primary/50 bg-primary/5',
  pending: 'border-warning/50 bg-warning/5',
  rejected: 'border-border',
  draft: 'border-border',
};

const day = (value: Date | string) => format(new Date(value), 'MMM d, yyyy');
const nameOf = (person?: { user: { name: string | null } } | null) =>
  person?.user?.name || 'Unknown';

/** Approval record for a version: who submitted, approved or rejected it, and when. */
function approvalLines(version: PolicyVersionWithPublisher, state: VersionState): string[] {
  const lines: string[] = [];
  if (version.submittedAt) {
    lines.push(`Submitted by ${nameOf(version.submittedBy)} on ${day(version.submittedAt)}`);
  }
  if (version.approvedAt) {
    lines.push(`Approved by ${nameOf(version.approvedBy)} on ${day(version.approvedAt)}`);
  }
  if (state === 'rejected' && version.rejectedAt) {
    lines.push(`Rejected by ${nameOf(version.rejectedBy)} on ${day(version.rejectedAt)}`);
  }
  const reviews = version.reviews ?? [];
  if (reviews.length > 0) {
    const last = reviews[0];
    lines.push(
      `Reviewed ${reviews.length === 1 ? 'once' : `${reviews.length} times`} · last on ${day(last.reviewedAt)} by ${nameOf(last.reviewer)}`,
    );
  }
  const acknowledged = version._count?.acknowledgements ?? 0;
  if (acknowledged > 0 || state === 'published') {
    lines.push(`Acknowledged by ${acknowledged} ${acknowledged === 1 ? 'employee' : 'employees'}`);
  }
  return lines;
}

export function PolicyVersionCard({
  version,
  state,
  actions,
}: {
  version: PolicyVersionWithPublisher;
  state: VersionState;
  actions: ReactNode;
}) {
  const publisher = version.publishedBy?.user;
  const badge = STATE_BADGE[state];
  const note = state === 'rejected' ? version.rejectionComment : version.approvalComment;

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${CARD_CLASS[state]}`}
    >
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <div className="hidden sm:block">
          <Avatar size="sm">
            <AvatarImage src={publisher?.image || ''} alt={publisher?.name || 'User'} />
            <AvatarFallback>{publisher?.name ? getInitials(publisher.name) : 'U'}</AvatarFallback>
          </Avatar>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text weight="medium">v{version.version}</Text>
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          {version.changelog && (
            <Text size="sm" variant="muted">
              {version.changelog}
            </Text>
          )}
          {approvalLines(version, state).map((line) => (
            <Text key={line} size="xs" variant="muted">
              {line}
            </Text>
          ))}
          {note && (
            <Text size="xs" variant={state === 'rejected' ? 'destructive' : 'muted'}>
              {state === 'rejected' ? 'Reason' : 'Note'}: “{note}”
            </Text>
          )}
          <Text size="xs" variant="muted">
            Last updated {format(new Date(version.updatedAt), "MMM d, yyyy 'at' h:mm a")} by{' '}
            {publisher?.name || 'System'}
          </Text>
        </div>
      </div>
      <div className="shrink-0">{actions}</div>
    </div>
  );
}
