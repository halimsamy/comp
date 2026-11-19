'use client';

import { type FrameworkScores, documentCounts, getControlScore } from '@/lib/control-compliance';
import type { FrameworkInstanceWithControls } from '@/lib/types/framework';
import { Badge, TableCell, TableRow, Text } from '@trycompai/design-system';
import { Launch } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { getStatusBadge } from './framework-controls-shared';

export function GroupedControlRow({
  control,
  requirements,
  scores,
  orgId,
  frameworkInstanceId,
  onRowClick,
}: {
  control: FrameworkInstanceWithControls['controls'][number];
  requirements: Array<{ id: string; name: string; identifier: string }>;
  scores: FrameworkScores | null | undefined;
  orgId: string;
  frameworkInstanceId: string;
  onRowClick: (controlId: string) => void;
}) {
  const { status, percent: compliancePercent, counts } = getControlScore(scores, control.id);
  const badge = getStatusBadge(status);
  const documents = documentCounts(counts);

  const controlHref = `/${orgId}/controls/${control.id}?framework=${frameworkInstanceId}`;

  const handleRowClick = () => {
    onRowClick(control.id);
  };

  const owner = control.owner && !control.owner.deactivated ? control.owner.user.name || control.owner.user.email : null;
  const reqLabel =
    requirements.length > 0
      ? requirements.map((r) => r.identifier || r.name).join(', ')
      : null;

  return (
    <TableRow onClick={handleRowClick} style={{ cursor: 'pointer' }}>
      <TableCell>
        <Link
          href={controlHref}
          onClick={(e) => e.stopPropagation()}
          className="group flex items-center gap-2 pl-6"
        >
          <span className="block max-w-[280px] truncate text-sm" title={control.name}>
            {control.name}
          </span>
          <Launch
            size={14}
            className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </Link>
      </TableCell>
      <TableCell>
        <span className={`block max-w-[160px] truncate text-sm ${owner ? '' : 'text-muted-foreground'}`} title={owner ?? undefined}>
          {owner ?? 'Unassigned'}
        </span>
      </TableCell>
      <TableCell>
        {reqLabel ? (
          <span className="block max-w-[200px] truncate text-sm" title={reqLabel}>
            {reqLabel}
          </span>
        ) : (
          <Text size="sm" variant="muted">
            —
          </Text>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="flex-1 rounded-full bg-muted/50 h-1.5">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${compliancePercent}%` }}
            />
          </div>
          <div className="tabular-nums w-10 text-right">
            <Text size="sm" variant="muted">
              {compliancePercent}%
            </Text>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </TableCell>
      <TableCell>
        <div className="tabular-nums">
          <Text size="sm" variant="muted">
            {counts.policies.completed}/{counts.policies.total}
          </Text>
        </div>
      </TableCell>
      <TableCell>
        <div className="tabular-nums">
          <Text size="sm" variant="muted">
            {counts.tasks.completed}/{counts.tasks.total}
          </Text>
        </div>
      </TableCell>
      <TableCell>
        <div className="tabular-nums">
          <Text size="sm" variant="muted">
            {documents.completed}/{documents.total}
          </Text>
        </div>
      </TableCell>
    </TableRow>
  );
}
