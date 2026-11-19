'use client';

import { api } from '@/lib/api-client';
import { useFeatureFlag } from '@trycompai/analytics';
import {
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import Link from 'next/link';
import useSWR from 'swr';
import { AUDIT_STATUS_LABELS } from '../../documents/isms/components/internal-audit-constants';
import { useIso27001FrameworkId } from '../../documents/isms/hooks/useIso27001FrameworkId';
import type { IsmsDocument, IsmsEnsureSetupResponse } from '../../documents/isms/isms-types';
import { formatDay } from '../lib/audit-labels';

const ISMS_FEATURE_FLAG = 'is-isms-enabled';

async function loadInternalAudits([, orgId, frameworkId]: readonly [string, string, string]) {
  const setup = await api.post<IsmsEnsureSetupResponse>('/v1/isms/ensure-setup', { frameworkId }, orgId);
  if (setup.error) throw new Error(setup.error);
  const doc = setup.data?.documents.find((d) => d.type === 'internal_audit');
  if (!doc) return [];
  const res = await api.get<IsmsDocument>(`/v1/isms/documents/${doc.id}`, orgId);
  if (res.error) throw new Error(res.error);
  return Array.isArray(res.data?.audits) ? res.data.audits : [];
}

/** ISO 27001 9.2 internal audits next to the external ones (#196). */
export function InternalAuditsSection({ orgId }: { orgId: string }) {
  const frameworkId = useIso27001FrameworkId(orgId);
  const flagOn = useFeatureFlag(ISMS_FEATURE_FLAG) || process.env.NODE_ENV === 'development';
  const { data, error, isLoading } = useSWR(
    frameworkId && flagOn ? (['isms-internal-audits', orgId, frameworkId] as const) : null,
    loadInternalAudits,
    { revalidateOnFocus: false },
  );
  const href = `/${orgId}/documents/isms/internal-audit`;

  if (!frameworkId || !flagOn) {
    return (
      <Text size="sm" variant="muted">
        Internal audits are part of the ISO 27001 ISMS. Add ISO 27001 to plan them here.
      </Text>
    );
  }
  if (error) {
    return (
      <Text size="sm" variant="destructive">
        Could not load internal audits. Refresh the page to try again.
      </Text>
    );
  }
  if (isLoading || !data) {
    return (
      <Text size="sm" variant="muted">
        Loading internal audits…
      </Text>
    );
  }
  if (data.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No internal audits yet</EmptyTitle>
          <EmptyDescription>
            ISO 27001 9.2 needs at least one internal audit a year before certification.{' '}
            <Link href={href} className="underline">
              Plan one in the ISMS
            </Link>
            .
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table variant="bordered">
        <TableHeader>
          <TableRow>
            <TableHead>Audit</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Findings</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((audit) => (
            <TableRow key={audit.id}>
              <TableCell>
                <div className="min-w-0 max-w-md whitespace-normal">
                  <Link href={href} className="font-medium hover:underline">
                    {audit.reference}
                  </Link>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{audit.scope}</div>
                </div>
              </TableCell>
              <TableCell>
                <Text size="sm" variant="muted">
                  {audit.plannedStartDate ? formatDay(audit.plannedStartDate) : 'Not scheduled'}
                  {audit.plannedEndDate ? ` – ${formatDay(audit.plannedEndDate)}` : ''}
                </Text>
              </TableCell>
              <TableCell>
                <Text size="sm">{audit.findings.length}</Text>
              </TableCell>
              <TableCell>
                <Badge variant={audit.status === 'complete' ? 'default' : 'outline'}>
                  {AUDIT_STATUS_LABELS[audit.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
