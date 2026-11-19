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
import { useState } from 'react';
import { EventDetailSheet } from './EventDetailSheet';
import {
  eventTypeLabel,
  formatEventTime,
  isFailureEvent,
  readChanges,
  readDataString,
} from './event-log-options';

function details(event: AuditEvent): string {
  const changed = readChanges(event.data).map((c) => c.field);
  const parts = [
    readDataString(event.data, 'entityName') ??
      (event.entityType && event.entityId ? `${event.entityType} ${event.entityId}` : null),
    changed.length > 0
      ? `Changed ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? '…' : ''}`
      : null,
    readDataString(event.data, 'ipAddress')
      ? `IP ${readDataString(event.data, 'ipAddress')}`
      : null,
    readDataString(event.data, 'via'),
  ].filter(Boolean);
  return parts.join(' · ');
}

const userLabel = (event: AuditEvent) => event.user?.name || event.user?.email || 'System';
const describe = (event: AuditEvent) =>
  event.description ?? readDataString(event.data, 'action') ?? '—';

function TypeBadge({ event }: { event: AuditEvent }) {
  return (
    <Badge variant={isFailureEvent(event.data) ? 'destructive' : 'secondary'}>
      {eventTypeLabel(readDataString(event.data, 'resource'))}
    </Badge>
  );
}

/** Events as a table (md+) or stacked cards (phones); each opens a detail sheet. */
export function EventLogTable({ events }: { events: AuditEvent[] }) {
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden" aria-label="Events">
        {events.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => setSelected(event)}
              className="flex w-full cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{describe(event)}</span>
                <TypeBadge event={event} />
              </div>
              <span className="text-xs text-muted-foreground">
                {userLabel(event)} · {formatEventTime(event.timestamp)}
              </span>
              {details(event) && (
                <span className="break-words text-xs text-muted-foreground">{details(event)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
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
              const extra = details(event);
              return (
                <TableRow
                  key={event.id}
                  onClick={() => setSelected(event)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelected(event)}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  aria-label={`Open event: ${describe(event)}`}
                >
                  <TableCell>
                    <span className="whitespace-nowrap">
                      <Text size="sm">{formatEventTime(event.timestamp)}</Text>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Stack gap="0">
                      <Text size="sm" weight="medium">
                        {userLabel(event)}
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
                        <Text size="sm">{describe(event)}</Text>
                        {extra && (
                          <Text size="xs" variant="muted">
                            {extra}
                          </Text>
                        )}
                      </Stack>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TypeBadge event={event} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <EventDetailSheet event={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}
