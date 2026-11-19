'use client';

import {
  openVulnerabilityFile,
  useVulnerabilityScans,
  type QuarterStatus,
  type ScanCadence,
} from '@/hooks/use-vulnerability-program';
import {
  Badge,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { Document } from '@trycompai/design-system/icons';
import { differenceInCalendarDays, format } from 'date-fns';
import { toast } from 'sonner';
import { CDE_SCOPE_LABELS } from '../../assets/lib/asset-labels';
import { SCAN_KIND_LABELS } from '../lib/vulnerability-labels';

const QUARTER: Record<
  QuarterStatus,
  { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }
> = {
  passed: { label: 'Pass', variant: 'default' },
  failed: { label: 'Fail', variant: 'destructive' },
  no_verdict: { label: 'Done', variant: 'secondary' },
  missing: { label: 'Missing', variant: 'destructive' },
  pending: { label: 'Due', variant: 'outline' },
};

const formatDate = (value: string) => format(new Date(value), 'MMM d, yyyy');

function cadenceLine(c: ScanCadence, now: Date): string {
  const anchor = c.kind === 'pentest' ? c.lastScanAt : c.lastPassingAt;
  if (!anchor)
    return c.kind === 'pentest' ? 'No test recorded yet' : 'No passing scan recorded yet';
  const days = differenceInCalendarDays(now, new Date(anchor));
  const what = c.kind === 'pentest' ? 'Last test' : 'Last passing scan';
  const next = c.nextDueAt ? ` · next due ${formatDate(c.nextDueAt)}` : '';
  return `${what} ${days} days ago${next}`;
}

const handleOpenFile = (id: string) =>
  openVulnerabilityFile(id).catch((error: unknown) =>
    toast.error(error instanceof Error ? error.message : 'Could not open the report'),
  );

/** Quarterly scan evidence (PCI DSS 11.3.1, 11.3.2, 11.4) with gaps called out. */
export function ScansTab() {
  const { scans, error, isLoading } = useVulnerabilityScans();
  if (isLoading) {
    return (
      <Text size="sm" variant="muted">
        Loading scans…
      </Text>
    );
  }
  if (error || !scans) {
    return (
      <Text size="sm" variant="destructive">
        Could not load scans. Refresh the page to try again.
      </Text>
    );
  }
  const now = new Date();

  return (
    <Stack gap="6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {scans.cadence.map((c) => (
          <div key={c.kind} className="min-w-0 rounded-lg border border-border p-4">
            <Stack gap="3">
              <Text size="sm" weight="medium">
                {SCAN_KIND_LABELS[c.kind]}
              </Text>
              <div className="flex flex-wrap gap-2">
                {c.quarters.map((q) => (
                  <div key={q.label} className="flex flex-col items-center gap-1">
                    <Text size="xs" variant="muted">
                      {q.label}
                    </Text>
                    <Badge variant={QUARTER[q.status].variant}>{QUARTER[q.status].label}</Badge>
                  </div>
                ))}
              </div>
              <Text size="xs" variant={c.overdue ? 'destructive' : 'muted'}>
                {cadenceLine(c, now)}
                {c.overdue ? ' (overdue)' : ''}
              </Text>
            </Stack>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border p-4">
        <Stack gap="2">
          <Text size="sm" weight="medium">
            Scan coverage: in-scope and connected assets
          </Text>
          {scans.uncovered.length === 0 ? (
            <Text size="sm" variant="muted">
              Every in-scope or connected asset appeared in a scan in the last 90 days.
            </Text>
          ) : (
            <>
              <Text size="sm" variant="destructive">
                {scans.uncovered.length} assets had no scan in the last 90 days.
              </Text>
              <div className="flex flex-wrap gap-2">
                {scans.uncovered.slice(0, 20).map((a) => (
                  <Badge key={a.id} variant="outline">
                    {`${a.name} · ${CDE_SCOPE_LABELS[a.cdeScope]}`}
                  </Badge>
                ))}
                {scans.uncovered.length > 20 ? (
                  <Text size="xs" variant="muted">{`and ${scans.uncovered.length - 20} more`}</Text>
                ) : null}
              </div>
            </>
          )}
        </Stack>
      </div>
      {scans.data.length === 0 ? (
        <Text size="sm" variant="muted">
          No scans recorded yet. Use Import scan to add your latest ASV, internal scan or
          penetration test with its report.
        </Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.data.map((scan) => (
                <TableRow key={scan.id}>
                  <TableCell>{formatDate(scan.scannedAt)}</TableCell>
                  <TableCell>{SCAN_KIND_LABELS[scan.kind]}</TableCell>
                  <TableCell>{scan.vendor ?? '—'}</TableCell>
                  <TableCell>
                    {scan.passed === null ? (
                      <Badge variant="secondary">No verdict</Badge>
                    ) : (
                      <Badge variant={scan.passed ? 'default' : 'destructive'}>
                        {scan.passed ? 'Pass' : 'Fail'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{scan.findingCount}</TableCell>
                  <TableCell>
                    {scan.attachmentId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        iconLeft={<Document size={14} />}
                        onClick={() => scan.attachmentId && void handleOpenFile(scan.attachmentId)}
                      >
                        Open
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Stack>
  );
}
