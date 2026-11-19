'use client';

import type { Vulnerability } from '@/hooks/use-vulnerabilities';
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
import { CDE_SCOPE_LABELS } from '../../assets/lib/asset-labels';
import {
  SEVERITY_LABELS,
  SLA_LABELS,
  severityBadgeVariant,
  slaBadgeVariant,
  sourceLabel,
} from '../lib/vulnerability-labels';

const formatDate = (value: string | null) => (value ? format(new Date(value), 'MMM d, yyyy') : '—');

/** Findings with severity, affected asset, owner and remediation SLA. */
export function VulnerabilitiesTable({
  vulnerabilities,
  onOpen,
}: {
  vulnerabilities: Vulnerability[];
  onOpen: (vulnerability: Vulnerability) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vulnerability</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>First seen</TableHead>
            <TableHead>SLA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vulnerabilities.map((v) => (
            <TableRow key={v.id}>
              <TableCell>
                <button
                  type="button"
                  onClick={() => onOpen(v)}
                  className="min-w-48 max-w-sm rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <div className="line-clamp-2">
                    <Text size="sm" weight="medium">
                      {v.title}
                    </Text>
                  </div>
                  {v.cveId ? (
                    <Text size="xs" variant="muted" font="mono">
                      {v.cveId}
                    </Text>
                  ) : null}
                </button>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={severityBadgeVariant(v.severity)}>
                    {SEVERITY_LABELS[v.severity]}
                  </Badge>
                  {v.asvFail && v.status === 'open' ? (
                    <Badge variant="destructive">ASV fail</Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="min-w-32 max-w-xs truncate">
                  <Text size="sm">{v.asset?.name ?? v.resourceId}</Text>
                </div>
                {v.asset &&
                v.asset.cdeScope !== 'out_of_scope' &&
                v.asset.cdeScope !== 'unassessed' ? (
                  <Text size="xs" variant="destructive">
                    {CDE_SCOPE_LABELS[v.asset.cdeScope]}
                  </Text>
                ) : null}
              </TableCell>
              <TableCell>
                <div className="whitespace-nowrap">
                  <Text size="sm">{sourceLabel(v)}</Text>
                </div>
              </TableCell>
              <TableCell>
                {v.owner ? (
                  <Text size="sm">{v.owner.name || v.owner.email}</Text>
                ) : (
                  <Text size="sm" variant="muted">
                    Unassigned
                  </Text>
                )}
              </TableCell>
              <TableCell>
                <div className="whitespace-nowrap">
                  <Text size="sm" variant="muted">
                    {formatDate(v.firstSeenAt)}
                  </Text>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex min-w-28 flex-col items-start gap-1">
                  {v.status === 'open' ? (
                    <Badge variant={slaBadgeVariant(v.slaStatus)}>{SLA_LABELS[v.slaStatus]}</Badge>
                  ) : (
                    <Badge variant="secondary">
                      {v.status === 'resolved' ? 'Resolved' : 'Ignored'}
                    </Badge>
                  )}
                  <Text size="xs" variant="muted">
                    {v.status === 'resolved'
                      ? formatDate(v.resolvedAt)
                      : v.slaDueAt
                        ? `Due ${formatDate(v.slaDueAt)}`
                        : ''}
                  </Text>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
