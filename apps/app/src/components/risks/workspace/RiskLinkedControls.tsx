'use client';

import { useRiskLinkedTasks } from '@/hooks/use-risk-workspace';
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import Link from 'next/link';
import { formatDay } from './workspace-types';

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
  not_relevant: 'Not relevant',
  failed: 'Failed',
};

/** Evidence tasks (and their controls) linked to risks: the controls side of 6.1.3. */
export function RiskLinkedControls({ orgId }: { orgId: string }) {
  const { rows, error, isLoading, mutate } = useRiskLinkedTasks();

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-6">
        <Text variant="muted">Couldn&apos;t load linked controls.</Text>
        <Button size="sm" variant="outline" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );
  }
  if (isLoading && rows.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No controls linked yet</EmptyTitle>
          <EmptyDescription>
            Link evidence tasks from a risk&apos;s Risk tab, or add risks from the library to link
            their recommended controls.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="max-w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Evidence task</TableHead>
            <TableHead>Controls</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ risk, task }) => (
            <TableRow key={`${risk.id}:${task.id}`}>
              <TableCell>
                <Link href={`/${orgId}/tasks/${task.id}`} className="hover:underline">
                  <span className="line-clamp-2 min-w-[180px] max-w-[320px] whitespace-normal text-sm">
                    {task.title}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <span className="line-clamp-2 max-w-[240px] whitespace-normal text-xs text-muted-foreground">
                  {task.controls.map((control) => control.name).join(', ') || '—'}
                </span>
              </TableCell>
              <TableCell>
                <Link href={`/${orgId}/risk/${risk.id}`} className="hover:underline">
                  <span className="line-clamp-2 max-w-[240px] whitespace-normal text-sm">
                    {risk.ref ? `${risk.ref} · ` : ''}
                    {risk.title}
                  </span>
                </Link>
              </TableCell>
              <TableCell>{task.assignee ? task.assignee.user.name || task.assignee.user.email : '—'}</TableCell>
              <TableCell>{formatDay(task.dueDate)}</TableCell>
              <TableCell>
                <Badge variant={task.status === 'done' ? 'default' : 'outline'}>
                  {STATUS_LABEL[task.status] ?? task.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
