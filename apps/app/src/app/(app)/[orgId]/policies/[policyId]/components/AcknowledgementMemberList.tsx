'use client';

import type { PolicyAcknowledgementMember } from '@/hooks/use-policy-lifecycle';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { format } from 'date-fns';

const formatDate = (value: string | null) => (value ? format(new Date(value), 'MMM d, yyyy') : '—');

export function memberDetail(member: PolicyAcknowledgementMember, currentVersion: number | null) {
  if (member.status === 'acknowledged') {
    return `${currentVersion ? `v${currentVersion} · ` : ''}${formatDate(member.acknowledgedAt)}`;
  }
  if (member.lastAcknowledgedVersion) {
    return `Last signed v${member.lastAcknowledgedVersion} on ${formatDate(member.lastAcknowledgedAt)}`;
  }
  return 'Never signed';
}

function StatusBadge({ member }: { member: PolicyAcknowledgementMember }) {
  return (
    <Badge variant={member.status === 'acknowledged' ? 'accent' : 'outline'}>
      {member.status === 'acknowledged' ? 'Acknowledged' : 'Pending'}
    </Badge>
  );
}

/** Table from md up; stacked cards on phones so nothing scrolls sideways. */
export function AcknowledgementMemberList({
  members,
  currentVersion,
}: {
  members: PolicyAcknowledgementMember[];
  currentVersion: number | null;
}) {
  if (members.length === 0) {
    return (
      <Text size="sm" variant="muted">
        Nobody in this view.
      </Text>
    );
  }

  return (
    <>
      <ul className="divide-y rounded-md border md:hidden" aria-label="Employees">
        {members.map((member) => (
          <li key={member.memberId} className="space-y-1 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate">
                  <Text size="sm" weight="medium">{member.name}</Text>
                </div>
                <div className="truncate">
                  <Text size="xs" variant="muted">{member.email}</Text>
                </div>
              </div>
              <StatusBadge member={member} />
            </div>
            <Text size="xs" variant="muted">
              {memberDetail(member, currentVersion)}
              {member.lastRemindedAt ? ` · Reminded ${formatDate(member.lastRemindedAt)}` : ''}
            </Text>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version · date</TableHead>
              <TableHead>Last reminded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.memberId}>
                <TableCell>
                  <div className="min-w-0">
                    <Text size="sm" weight="medium">{member.name}</Text>
                    <Text size="xs" variant="muted">{member.email}</Text>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge member={member} />
                </TableCell>
                <TableCell>
                  <Text size="sm" variant="muted">
                    {memberDetail(member, currentVersion)}
                  </Text>
                </TableCell>
                <TableCell>
                  <Text size="sm" variant="muted">
                    {formatDate(member.lastRemindedAt)}
                  </Text>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
