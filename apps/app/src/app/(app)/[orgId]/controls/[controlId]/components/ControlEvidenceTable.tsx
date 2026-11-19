'use client';

import { ISMS_TYPE_META, ismsTypeToSlug } from '@/app/(app)/[orgId]/documents/isms/isms-types';
import type { ControlEvidenceItem, EvidenceKind, EvidenceState } from '@/hooks/use-control-evidence';
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
import Link from 'next/link';
import { getDocumentTypeLabel, toDocumentUrlSlug } from './documentTypeLabels';

const KIND_LABEL: Record<EvidenceKind, string> = {
  policy: 'Policy',
  task: 'Task',
  form: 'Form',
  isms_document: 'ISMS document',
};

const STATE_BADGE: Record<EvidenceState, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  complete: { label: 'Done', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'secondary' },
  missing: { label: 'Missing', variant: 'destructive' },
  not_relevant: { label: 'Not relevant', variant: 'outline' },
};

export function evidenceHref({ orgId, item }: { orgId: string; item: ControlEvidenceItem }): string | null {
  if (item.kind === 'policy') return `/${orgId}/policies/${item.id}`;
  if (item.kind === 'task') return `/${orgId}/tasks/${item.id}`;
  if (item.kind === 'form') return `/${orgId}/documents/${toDocumentUrlSlug(item.id)}`;
  const meta = ISMS_TYPE_META.find((m) => m.type === item.type);
  return meta ? `/${orgId}/documents/isms/${ismsTypeToSlug(meta.type)}` : null;
}

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

export function ControlEvidenceTable({
  orgId,
  items,
  isLoading,
  error,
  emptyText = 'No evidence linked yet.',
}: {
  orgId: string;
  items: ControlEvidenceItem[];
  isLoading: boolean;
  error?: Error;
  emptyText?: string;
}) {
  if (error) return <Text size="sm" variant="destructive">Could not load evidence.</Text>;
  if (isLoading) return <Text size="sm" variant="muted">Loading evidence…</Text>;
  if (items.length === 0) return <Text size="sm" variant="muted">{emptyText}</Text>;

  return (
    <div className="overflow-x-auto">
      <Table variant="bordered">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const href = evidenceHref({ orgId, item });
            const name = item.kind === 'form' ? getDocumentTypeLabel(item.id) : item.name;
            const badge = STATE_BADGE[item.state];
            return (
              <TableRow key={`${item.kind}:${item.id}`}>
                <TableCell>
                  {href ? (
                    <Link href={href} className="block max-w-[320px] truncate text-sm text-primary hover:underline" title={name}>
                      {name}
                    </Link>
                  ) : (
                    <span className="block max-w-[320px] truncate text-sm">{name}</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="whitespace-nowrap text-sm text-muted-foreground">{KIND_LABEL[item.kind]}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </TableCell>
                <TableCell>
                  <span className="whitespace-nowrap text-sm">{item.owner ?? '—'}</span>
                </TableCell>
                <TableCell>
                  <span className="whitespace-nowrap text-sm tabular-nums">{formatDate(item.updatedAt)}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
