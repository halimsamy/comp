'use client';

import type { AuditEvent } from '@/hooks/use-audit-events';
import {
  Badge,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Stack,
  Text,
} from '@trycompai/design-system';
import {
  eventTypeLabel,
  formatEventTime,
  formatValue,
  isFailureEvent,
  readChanges,
  readDataString,
} from './event-log-options';

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

/** One event in full: who, when, from where (IP, user agent), outcome and the field-level diff. */
export function EventDetailSheet({
  event,
  onOpenChange,
}: {
  event: AuditEvent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const data = event?.data ?? null;
  const changes = readChanges(data);
  const statusCode = data?.statusCode;

  return (
    <Sheet open={!!event} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{event?.description ?? readDataString(data, 'action') ?? 'Event'}</SheetTitle>
          <SheetDescription>{event ? formatEventTime(event.timestamp) : ''}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {event && (
            <Stack gap="4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {eventTypeLabel(readDataString(data, 'resource'))}
                </Badge>
                {isFailureEvent(data) && (
                  <Badge variant="destructive">
                    Failed{typeof statusCode === 'number' ? ` (${statusCode})` : ''}
                  </Badge>
                )}
              </div>
              <Stack gap="2">
                <Row
                  label="User"
                  value={
                    event.user ? `${event.user.name ?? ''} ${event.user.email}`.trim() : 'System'
                  }
                />
                <Row label="Record" value={readDataString(data, 'entityName')} />
                <Row
                  label="Target"
                  value={
                    event.entityType && event.entityId
                      ? `${event.entityType} ${event.entityId}`
                      : null
                  }
                />
                <Row label="IP address" value={readDataString(data, 'ipAddress')} />
                <Row label="User agent" value={readDataString(data, 'userAgent')} />
                <Row label="Via" value={readDataString(data, 'via')} />
                <Row
                  label="Request"
                  value={
                    [readDataString(data, 'method'), readDataString(data, 'path')]
                      .filter(Boolean)
                      .join(' ') || null
                  }
                />
              </Stack>
              <Stack gap="2">
                <Text size="sm" weight="medium">
                  Changes
                </Text>
                {changes.length === 0 ? (
                  <Text size="sm" variant="muted">
                    No field changes were recorded for this event.
                  </Text>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {changes.map((c) => (
                      <li key={c.field} className="rounded-md border p-2 text-sm">
                        <div className="font-medium">{c.field}</div>
                        <div className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
                          <span className="break-words text-muted-foreground line-through">
                            {formatValue(c.previous)}
                          </span>
                          <span className="break-words">{formatValue(c.current)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Stack>
            </Stack>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
