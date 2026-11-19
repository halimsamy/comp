'use client';

import { usePermissions } from '@/hooks/use-permissions';
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Section,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import {
  Add,
  CheckmarkFilled,
  Incomplete,
  Time,
  WarningAltFilled,
} from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import Link from 'next/link';
import { useState } from 'react';
import { useNonconformities, type IsmsNonconformityRow } from '../hooks/useNonconformities';
import { ImportNonconformitiesButton } from './ImportNonconformitiesButton';
import type { ApproverOption } from './IsmsApprovalSection';
import { NC_STATUS_LABELS, SOURCE_LABELS } from './nonconformity-schema';
import { NonconformitySheet } from './NonconformitySheet';
import { IsmsSummaryRow } from './shared';

type Filter = 'all' | 'open' | 'overdue' | 'review' | 'closed';

const formatDate = (value: string | null) => (value ? format(new Date(value), 'MMM d, yyyy') : '—');

export function isOverdue(row: IsmsNonconformityRow, now = new Date()): boolean {
  return (
    row.status !== 'closed' && !!row.dueDate && new Date(row.dueDate).getTime() < now.getTime()
  );
}

/** Closed, but nobody has checked yet whether the action worked (10.2 d). */
export function awaitsEffectivenessReview(row: IsmsNonconformityRow): boolean {
  return row.status === 'closed' && !row.effectivenessReviewedAt;
}

const FILTERS: Record<Filter, (row: IsmsNonconformityRow) => boolean> = {
  all: () => true,
  open: (row) => row.status !== 'closed',
  overdue: (row) => isOverdue(row),
  review: awaitsEffectivenessReview,
  closed: (row) => row.status === 'closed',
};

function ReferenceCell({ row }: { row: IsmsNonconformityRow }) {
  return (
    <>
      <Text size="sm" weight="medium">
        {row.reference}
      </Text>
      <Text size="xs" variant="muted">
        {SOURCE_LABELS[row.source] ?? row.source}
        {row.sourceRef && row.kind === 'external_finding' ? ` · ${row.sourceRef}` : ''}
        {row.severity ? ` · ${row.severity}` : ''}
      </Text>
    </>
  );
}

export function NonconformityRegisterClient({
  organizationId,
  fallbackData,
  memberOptions,
}: {
  organizationId: string;
  fallbackData?: IsmsNonconformityRow[];
  memberOptions: ApproverOption[];
}) {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('evidence', 'update');
  const { rows, hasData, error, create, update, importMany } = useNonconformities({
    organizationId,
    fallbackData,
  });
  const [filter, setFilter] = useState<Filter>('all');
  const [sheetRow, setSheetRow] = useState<IsmsNonconformityRow | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const memberName = (id: string | null) =>
    (id && memberOptions.find((member) => member.id === id)?.name) || 'Unassigned';
  const count = (key: Filter) => rows.filter(FILTERS[key]).length;
  const visible = rows.filter(FILTERS[filter]);

  const handleOpen = (row: IsmsNonconformityRow | null) => {
    setSheetRow(row);
    setIsSheetOpen(true);
  };

  const handleSubmit = (payload: Record<string, string | null>) =>
    sheetRow ? update({ row: sheetRow, payload }) : create(payload);

  if (error && !hasData) {
    return (
      <Text size="sm" variant="destructive">
        Could not load the nonconformity register. Refresh the page to try again.
      </Text>
    );
  }
  if (!hasData) {
    return (
      <Text size="sm" variant="muted">
        Loading nonconformities…
      </Text>
    );
  }

  return (
    <Stack gap="6">
      <IsmsSummaryRow
        stats={[
          { label: 'Open', value: count('open'), icon: Incomplete },
          {
            label: 'Overdue',
            value: count('overdue'),
            icon: Time,
            tone: count('overdue') > 0 ? 'warning' : 'default',
          },
          {
            label: 'Awaiting effectiveness review',
            value: count('review'),
            icon: WarningAltFilled,
            tone: count('review') > 0 ? 'warning' : 'default',
          },
          { label: 'Closed', value: count('closed'), icon: CheckmarkFilled, tone: 'success' },
        ]}
      />
      <Section
        title="Nonconformities & corrective actions"
        description="Every nonconformity, from internal audits, incidents, external audits, management reviews and monitoring, with its root cause, corrective action and effectiveness review (ISO 27001 10.2)."
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <ImportNonconformitiesButton memberOptions={memberOptions} onImport={importMany} />
              <Button type="button" iconLeft={<Add size={16} />} onClick={() => handleOpen(null)}>
                Log nonconformity
              </Button>
            </div>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No nonconformities logged</EmptyTitle>
              <EmptyDescription>
                Findings from internal and external audits appear here automatically. Log the ones
                raised by incidents, management reviews or missed metrics, or import your existing
                log as CSV.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Stack gap="4">
            <div className="overflow-x-auto">
              <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
                <TabsList variant="underline">
                  <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
                  <TabsTrigger value="open">Open ({count('open')})</TabsTrigger>
                  <TabsTrigger value="overdue">Overdue ({count('overdue')})</TabsTrigger>
                  <TabsTrigger value="review">Needs review ({count('review')})</TabsTrigger>
                  <TabsTrigger value="closed">Closed ({count('closed')})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Nonconformity</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Effectiveness</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {row.kind === 'external_finding' ? (
                          // One register (#171): external findings are edited under Audits → Findings.
                          <Link
                            href={`/${organizationId}/audits?tab=findings&open=${row.id}`}
                            className="block min-w-28 rounded-sm hover:underline"
                          >
                            <ReferenceCell row={row} />
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpen(row)}
                            className="min-w-28 rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            <ReferenceCell row={row} />
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="line-clamp-2 min-w-48 max-w-md">
                          <Text size="sm">{row.description}</Text>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Text size="sm">{memberName(row.ownerMemberId)}</Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant={isOverdue(row) ? 'destructive' : 'muted'}>
                          {formatDate(row.dueDate)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.status === 'closed'
                              ? 'accent'
                              : isOverdue(row)
                                ? 'destructive'
                                : 'outline'
                          }
                        >
                          {isOverdue(row) ? 'Overdue' : NC_STATUS_LABELS[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Text size="sm" variant="muted">
                          {row.effectivenessReviewedAt
                            ? `Reviewed ${formatDate(row.effectivenessReviewedAt)}`
                            : awaitsEffectivenessReview(row)
                              ? 'Review due'
                              : '—'}
                        </Text>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {visible.length === 0 ? (
              <Text size="sm" variant="muted">
                Nothing matches this filter.
              </Text>
            ) : null}
          </Stack>
        )}
      </Section>
      <NonconformitySheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        row={sheetRow}
        memberOptions={memberOptions}
        canEdit={canEdit}
        onSubmit={handleSubmit}
      />
    </Stack>
  );
}
