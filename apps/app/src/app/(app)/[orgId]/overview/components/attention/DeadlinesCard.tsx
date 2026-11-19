'use client';

import { type DeadlineItem, type DeadlineType, useOverviewDeadlines } from '@/hooks/use-overview';
import {
  Badge,
  Button,
  Card,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { CheckmarkOutline, Time } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState } from 'react';

const TYPE_LABEL: Record<DeadlineType, string> = {
  task: 'Task',
  policy_review: 'Policy',
  vendor_review: 'Vendor',
  vendor_document: 'Document',
  training: 'Training',
  access_review: 'Access',
  policy_approval: 'Approval',
  timeline_phase: 'Timeline',
  audit_request: 'Audit',
  questionnaire_review: 'Questionnaire',
  vulnerability: 'Vulnerability',
  corrective_action: 'Corrective action',
  review_action: 'Review action',
  risk_review: 'Risk review',
  risk_action: 'Risk action',
  scan: 'Scan',
  form: 'Form',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDue({ dueDate, now = new Date() }: { dueDate: string; now?: Date }): string {
  const days = Math.round((new Date(dueDate).getTime() - now.getTime()) / DAY_MS);
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

type Group = 'overdue' | 'dueSoon' | 'noDueDate';
const GROUPS: Group[] = ['overdue', 'dueSoon', 'noDueDate'];
const EMPTY_TEXT: Record<Group, string> = {
  overdue: 'Nothing is overdue.',
  dueSoon: 'Nothing is due in the next 30 days.',
  noDueDate: 'Every open item has a due date.',
};

export function DeadlinesCard({ organizationId }: { organizationId: string }) {
  const { deadlines, isLoading, hasError, mutate } = useOverviewDeadlines({ days: 30 });
  const [group, setGroup] = useState<Group>('overdue');

  const items = deadlines ? deadlines[group] : [];
  const counts: Record<Group, number> = {
    overdue: deadlines?.overdueCount ?? 0,
    dueSoon: deadlines?.dueSoonCount ?? 0,
    noDueDate: deadlines?.noDueDateCount ?? 0,
  };
  const count = counts[group];
  // Undated work can never show as overdue, so an empty queue is not "all clear" (#4).
  const undated = group !== 'noDueDate' ? counts.noDueDate : 0;

  return (
    <Card
      title="Deadlines"
      description="Overdue and due in the next 30 days, across every module"
      width="full"
    >
      <div className="flex flex-col gap-3">
        {deadlines && (
          <div className="max-w-full overflow-x-auto">
            <Tabs
              value={group}
              onValueChange={(value) => setGroup(GROUPS.find((g) => g === value) ?? 'overdue')}
            >
              <TabsList variant="underline">
                <TabsTrigger value="overdue">Overdue ({counts.overdue})</TabsTrigger>
                <TabsTrigger value="dueSoon">Due soon ({counts.dueSoon})</TabsTrigger>
                <TabsTrigger value="noDueDate">No due date ({counts.noDueDate})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
        {isLoading && !deadlines ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 40, width: '100%' }} />
            ))}
          </div>
        ) : hasError || !deadlines ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text size="sm" variant="muted">
              We couldn&apos;t load deadlines.
            </Text>
            <Button size="sm" variant="outline" onClick={() => mutate()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 && undated > 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Time size={24} className="text-muted-foreground" />
            <Text size="sm" variant="muted">
              {EMPTY_TEXT[group]} {undated} {undated === 1 ? 'item has' : 'items have'} no due date.
            </Text>
            <Button size="sm" variant="outline" onClick={() => setGroup('noDueDate')}>
              Review items without a due date
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckmarkOutline size={24} className="text-green-600 dark:text-green-400" />
            <Text size="sm" variant="muted">
              {EMPTY_TEXT[group]}
            </Text>
          </div>
        ) : (
          <div className="flex flex-col">
            <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
              {items.map((item) => (
                <DeadlineRow
                  key={`${item.type}:${item.id}`}
                  item={item}
                  organizationId={organizationId}
                />
              ))}
            </ul>
            {count > items.length && (
              <Text size="xs" variant="muted">
                Showing {items.length} of {count}
              </Text>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function DeadlineRow({ item, organizationId }: { item: DeadlineItem; organizationId: string }) {
  const overdue = item.dueDate !== null && new Date(item.dueDate).getTime() < Date.now();
  return (
    <li>
      <Link
        href={`/${organizationId}${item.href}`}
        className="flex flex-col gap-1 rounded-sm px-1 py-2.5 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Badge variant="outline">{TYPE_LABEL[item.type]}</Badge>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-foreground">{item.title}</span>
            {(item.subtitle || item.ownerName) && (
              <span className="truncate text-xs text-muted-foreground">
                {[item.subtitle, item.ownerName].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 pl-[52px] text-xs tabular-nums sm:pl-0 ${overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
        >
          {item.dueDate ? formatDue({ dueDate: item.dueDate }) : 'No due date'}
        </span>
      </Link>
    </li>
  );
}
