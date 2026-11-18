'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useRiskTreatmentActions, type RiskTreatmentAction } from '@/hooks/use-risk-workspace';
import { useTaskItemActions } from '@/hooks/use-task-items';
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { Add, CheckmarkOutline, Download, Edit } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ACTION_FILTERS, countActions, filterActions, type ActionFilter } from './action-filters';
import { ACTION_STATUS_LABEL, buildRiskActionsCsv, downloadCsv } from './risk-actions-csv';
import { RiskActionSheet, type RiskActionValues } from './RiskActionSheet';
import { formatDay, memberLabel, type WorkspaceMember } from './workspace-types';

const STATUS_VARIANT: Record<RiskTreatmentAction['status'], 'default' | 'accent' | 'secondary' | 'outline'> = {
  todo: 'outline',
  in_progress: 'accent',
  in_review: 'accent',
  done: 'default',
  canceled: 'secondary',
};

/** Treatment actions across every risk: owner, due date, status, CSV (ISO 27001 6.1.3 / 8.3). */
export function RiskActionTracker({ orgId, members }: { orgId: string; members: WorkspaceMember[] }) {
  const { actions, error, isLoading, mutate } = useRiskTreatmentActions();
  const { createTaskItem, updateTaskItem } = useTaskItemActions();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('task', 'create');
  const canUpdate = hasPermission('task', 'update');
  const [filter, setFilter] = useState<ActionFilter>('open');
  const [ownerId, setOwnerId] = useState('all');
  const [editing, setEditing] = useState<RiskTreatmentAction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const counts = useMemo(() => countActions(actions), [actions]);
  const visible = useMemo(() => filterActions({ actions, filter, ownerId }), [actions, filter, ownerId]);

  const handleOpenSheet = (action: RiskTreatmentAction | null) => {
    setEditing(action);
    setSheetOpen(true);
  };

  const handleSave = async (values: RiskActionValues) => {
    const shared = {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
    };
    try {
      if (editing) {
        await updateTaskItem(editing.id, {
          ...shared,
          status: values.status,
          assigneeId: values.assigneeId || null,
          dueDate: values.dueDate || null,
        });
      } else {
        await createTaskItem({
          ...shared,
          entityId: values.riskId,
          entityType: 'risk',
          assigneeId: values.assigneeId || undefined,
          dueDate: values.dueDate || undefined,
        });
      }
      await mutate();
      toast.success(editing ? 'Action updated' : 'Action added');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to save the action');
      throw caught;
    }
  };

  const handleComplete = async (action: RiskTreatmentAction) => {
    try {
      await updateTaskItem(action.id, { status: 'done' });
      await mutate();
      toast.success('Action completed');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to complete the action');
    }
  };

  const handleExport = () => {
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv({ csv: buildRiskActionsCsv(visible), filename: `risk-treatment-actions-${day}.csv` });
  };

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-6">
        <Text variant="muted">Couldn&apos;t load treatment actions.</Text>
        <Button size="sm" variant="outline" onClick={() => void mutate()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter actions">
          {ACTION_FILTERS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? 'default' : 'outline'}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label} · {counts[option.value]}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-[200px]">
            <Select value={ownerId} onValueChange={(value) => setOwnerId(value ?? 'all')}>
              <SelectTrigger aria-label="Owner">
                <SelectValue>
                  {(value: string) => {
                    if (value === 'all') return 'All owners';
                    if (value === 'none') return 'Unassigned';
                    const member = members.find((candidate) => candidate.id === value);
                    return member ? memberLabel(member) : 'Owner';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                <SelectItem value="none">Unassigned</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {memberLabel(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              iconLeft={<Download size={16} />}
              onClick={handleExport}
              disabled={visible.length === 0}
            >
              Export CSV
            </Button>
            {canCreate && (
              <Button iconLeft={<Add size={16} />} onClick={() => handleOpenSheet(null)}>
                Add action
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading && actions.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{actions.length === 0 ? 'No treatment actions yet' : 'Nothing matches'}</EmptyTitle>
            <EmptyDescription>
              {actions.length === 0
                ? 'Break each risk treatment plan into actions with an owner and a due date. Auditors use this list as evidence that treatment is carried out (ISO 27001 8.3).'
                : 'No actions match these filters.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              {canUpdate && <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((action) => {
              const isOpen = action.status !== 'done' && action.status !== 'canceled';
              return (
                <TableRow key={action.id}>
                  <TableCell>
                    <div className="flex min-w-[180px] max-w-[360px] flex-col gap-0.5">
                      <span className="text-sm font-medium">{action.title}</span>
                      {action.description && (
                        <span className="line-clamp-2 text-xs text-muted-foreground">{action.description}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {action.risk ? (
                      <Link
                        href={`/${orgId}/risk/${action.risk.id}`}
                        className="text-sm underline-offset-4 hover:underline"
                      >
                        {action.risk.title}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap text-sm">
                      {action.assignee ? memberLabel(action.assignee) : 'Unassigned'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap text-sm">
                      {formatDay(action.dueDate)}
                      {action.isOverdue && <Badge variant="destructive">Overdue</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[action.status]}>{ACTION_STATUS_LABEL[action.status]}</Badge>
                  </TableCell>
                  {canUpdate && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {isOpen && (
                          <Button
                            size="sm"
                            variant="outline"
                            iconLeft={<CheckmarkOutline size={14} />}
                            onClick={() => void handleComplete(action)}
                          >
                            Complete
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${action.title}`}
                          onClick={() => handleOpenSheet(action)}
                        >
                          <Edit size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <RiskActionSheet
        open={sheetOpen}
        action={editing}
        members={members}
        onOpenChange={setSheetOpen}
        onSave={handleSave}
      />
    </div>
  );
}
