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
import { ITEM_STATUS_LABELS, itemBadgeVariant, itemStatus } from '../../lib/audit-labels';

const evidenceSummary = (r: AuditRequirement) => {
  const parts = [
    r.tasks.length ? `${r.tasks.length} task${r.tasks.length === 1 ? '' : 's'}` : null,
    r.policies.length ? `${r.policies.length} polic${r.policies.length === 1 ? 'y' : 'ies'}` : null,
    r.documents.length ? `${r.documents.length} document${r.documents.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No evidence linked';
};

/** Requirement rows with evidence counts and the auditor assessment. */
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
                    className="min-w-48 max-w-md rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <Text size="xs" variant="muted" font="mono">
                      {requirement.identifier || '—'}
                    </Text>
                    <Text size="sm" weight="medium">
                      {requirement.name}
                    </Text>
                  </button>
                </TableCell>
                <TableCell>
                  <Text size="sm" variant="muted">
                    {evidenceSummary(requirement)}
                  </Text>
                </TableCell>
                <TableCell>
                  <Badge variant={itemBadgeVariant(status)}>{ITEM_STATUS_LABELS[status]}</Badge>
                </TableCell>
                <TableCell>
                  {requirement.commentCount + requirement.openRequestCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Chat size={14} />
                      <Text size="xs" variant="muted">
                        {requirement.commentCount} comments
                        {requirement.openRequestCount > 0
                          ? ` · ${requirement.openRequestCount} open requests`
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
