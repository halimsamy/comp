'use client';

import type { AuditEvent } from '@/hooks/use-audit-events';
import {
  Badge,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { eventTypeLabel, readDataString } from './event-log-options';

const FAILURE_EVENTS = new Set(['sign_in_failed', 'session_idle_expired']);

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function details(event: AuditEvent): string {
  const parts = [
    event.entityType && event.entityId ? `${event.entityType} ${event.entityId}` : null,
    readDataString(event.data, 'ipAddress') ? `IP ${readDataString(event.data, 'ipAddress')}` : null,
    readDataString(event.data, 'via'),
  ].filter(Boolean);
  return parts.join(' · ');
}

export function EventLogTable({ events }: { events: AuditEvent[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Type</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => {
          const resource = readDataString(event.data, 'resource');
          const authEvent = readDataString(event.data, 'permission');
          const isFailure = resource === 'auth' && !!authEvent && FAILURE_EVENTS.has(authEvent);
          const extra = details(event);
          return (
            <TableRow key={event.id}>
              <TableCell>
                <span className="whitespace-nowrap">
                  <Text size="sm">{formatTime(event.timestamp)}</Text>
                </span>
              </TableCell>
              <TableCell>
                <Stack gap="0">
                  <Text size="sm" weight="medium">
                    {event.user?.name || event.user?.email || 'System'}
                  </Text>
                  {event.user?.name && (
                    <Text size="xs" variant="muted">
                      {event.user.email}
                    </Text>
                  )}
                </Stack>
              </TableCell>
              <TableCell>
                <div className="min-w-[200px]">
                  <Stack gap="0">
                    <Text size="sm">{event.description ?? readDataString(event.data, 'action') ?? '—'}</Text>
                    {extra && (
                      <Text size="xs" variant="muted">
                        {extra}
                      </Text>
                    )}
                  </Stack>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={isFailure ? 'destructive' : 'secondary'}>
                  {eventTypeLabel(resource)}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
