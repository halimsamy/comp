'use client';

import { useApiSWR } from '@/hooks/use-api-swr';

export interface AuditEvent {
  id: string;
  timestamp: string;
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  data: Record<string, unknown> | null;
  user: { id: string; name: string | null; email: string; image: string | null } | null;
}

export interface AuditEventFilters {
  userId?: string;
  resource?: string;
  from?: string;
  to?: string;
  search?: string;
}

export const AUDIT_EVENTS_PAGE_SIZE = 50;

/** Query string for the event log list and its CSV export (same filters). */
export function buildAuditEventsQuery(filters: AuditEventFilters, page?: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page !== undefined) {
    params.set('take', String(AUDIT_EVENTS_PAGE_SIZE));
    params.set('offset', String(page * AUDIT_EVENTS_PAGE_SIZE));
  }
  return params.toString();
}

/** Org-wide event log (audit:read). */
export function useAuditEvents({ filters, page }: { filters: AuditEventFilters; page: number }) {
  const { data, error, isLoading } = useApiSWR<{ data: AuditEvent[]; count: number }>(
    `/v1/audit-logs/events?${buildAuditEventsQuery(filters, page)}`,
    { keepPreviousData: true },
  );
  const events = Array.isArray(data?.data?.data) ? data.data.data : [];
  return {
    events,
    count: data?.data?.count ?? 0,
    error: error ?? (data?.error ? new Error(data.error) : undefined),
    isLoading,
  };
}
