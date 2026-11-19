'use client';

import type { AuditRequirement } from '@/hooks/use-audits';
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
import { Chat } from '@trycompai/design-system/icons';
import {
  ITEM_STATUS_LABELS,
  blockedByLabel,
  evidenceProgress,
  itemBadgeVariant,
  itemStatus,
  plural,
} from '../../lib/audit-labels';

/** Requirement rows with evidence progress, what blocks them and the auditor assessment. */
export function RequirementsTable({
  requirements,
  onOpen,
}: {
  requirements: AuditRequirement[];
  onOpen: (requirement: AuditRequirement) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requirement</TableHead>
            <TableHead>Evidence</TableHead>
            <TableHead>Auditor assessment</TableHead>
            <TableHead>Discussion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requirements.map((requirement) => {
            const status = itemStatus(requirement);
            return (
              <TableRow key={requirement.id}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onOpen(requirement)}
                    className="block w-full min-w-48 max-w-md whitespace-normal rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <Text size="xs" variant="muted" font="mono">
                      {requirement.identifier || '—'}
                    </Text>
                    <span className="line-clamp-3 text-sm font-medium" title={requirement.name}>
                      {requirement.name}
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <div className="min-w-48 max-w-xs whitespace-normal">
                    <Text size="sm" variant="muted">
                      {evidenceProgress(requirement)}
                    </Text>
                    {status !== 'not_applicable' && blockedByLabel(requirement.blockedBy) ? (
                      <span
                        className="line-clamp-2 text-xs text-destructive"
                        title={requirement.blockedBy.join('\n')}
                      >
                        {blockedByLabel(requirement.blockedBy)}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={itemBadgeVariant(status)}>{ITEM_STATUS_LABELS[status]}</Badge>
                </TableCell>
                <TableCell>
                  {requirement.commentCount + requirement.openRequestCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Chat size={14} />
                      <Text size="xs" variant="muted">
                        {plural({ count: requirement.commentCount, word: 'comment' })}
                        {requirement.openRequestCount > 0
                          ? ` · ${plural({ count: requirement.openRequestCount, word: 'open request' })}`
                          : ''}
                      </Text>
                    </span>
                  ) : (
                    <Text size="xs" variant="muted">
                      —
                    </Text>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
