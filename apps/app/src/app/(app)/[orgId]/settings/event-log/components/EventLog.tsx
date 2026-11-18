'use client';

import {
  AUDIT_EVENTS_PAGE_SIZE,
  buildAuditEventsQuery,
  useAuditEvents,
  type AuditEventFilters,
} from '@/hooks/use-audit-events';
import { useDebounce } from '@/hooks/useDebounce';
import { downloadEventLogCsv } from '@/lib/evidence-download';
import {
  Alert,
  AlertDescription,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  HStack,
  Section,
  Skeleton,
  Stack,
  Text,
} from '@trycompai/design-system';
import { Download } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { EventLogFilters } from './EventLogFilters';
import { EventLogTable } from './EventLogTable';

/** Org-wide event log (ISO 27001 A.8.15, PCI DSS 10.2): every change, sign-in, sign-out and idle timeout. */
export function EventLog() {
  const [filters, setFilters] = useState<AuditEventFilters>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const activeFilters = { ...filters, search: debouncedSearch.trim() || undefined };
  const { events, count, error, isLoading } = useAuditEvents({ filters: activeFilters, page });

  const pageCount = Math.max(1, Math.ceil(count / AUDIT_EVENTS_PAGE_SIZE));
  const first = count === 0 ? 0 : page * AUDIT_EVENTS_PAGE_SIZE + 1;
  const last = Math.min(count, (page + 1) * AUDIT_EVENTS_PAGE_SIZE);

  const handleFiltersChange = (next: AuditEventFilters) => {
    setFilters(next);
    setPage(0);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadEventLogCsv(buildAuditEventsQuery(activeFilters));
    } catch {
      toast.error('Failed to export the event log');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Section
      title="Event log"
      description="Every change made in Comp AI, plus sign-ins, sign-outs, failed sign-ins and idle timeouts. Export it as audit-log evidence for ISO 27001 A.8.15 and PCI DSS 10.2."
      actions={
        <Button
          variant="outline"
          iconLeft={<Download size={16} />}
          loading={exporting}
          onClick={handleExport}
        >
          Export CSV
        </Button>
      }
    >
      <Stack gap="4">
        <EventLogFilters
          filters={filters}
          search={search}
          onSearchChange={handleSearchChange}
          onChange={handleFiltersChange}
        />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>The event log couldn&apos;t be loaded. Try again.</AlertDescription>
          </Alert>
        ) : isLoading && events.length === 0 ? (
          <Stack gap="2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} style={{ height: '2.5rem', width: '100%' }} />
            ))}
          </Stack>
        ) : events.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No events found</EmptyTitle>
              <EmptyDescription>
                Try a wider date range or clear the filters. New sign-ins and changes appear here as
                they happen.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <EventLogTable events={events} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Text size="sm" variant="muted">
                Showing {first}–{last} of {count.toLocaleString()} events
              </Text>
              <HStack gap="2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </HStack>
            </div>
          </>
        )}
      </Stack>
    </Section>
  );
}
