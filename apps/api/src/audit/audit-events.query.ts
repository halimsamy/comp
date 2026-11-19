import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Prisma } from '@db';
import { toCsvRow } from '../evidence-forms/evidence-forms-csv';

/** Filters for the org-wide event log (ISO 27001 A.8.15, PCI DSS 10.2). */
export class AuditEventsQueryDto {
  @ApiPropertyOptional({ description: 'Only events by this user ID', example: 'usr_abc123' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  userId?: string;

  @ApiPropertyOptional({
    description: 'Only events on this resource (e.g. auth, policy, organization)',
    example: 'auth',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  resource?: string;

  @ApiPropertyOptional({ description: 'Events at or after this ISO date', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Events at or before this ISO date', example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Text to find in the event description, the record name or a changed field name',
    example: 'signed in',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'Page size (max 100, default 50)', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiPropertyOptional({ description: 'Rows to skip (default 0)', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  offset?: number;
}

/** A date-only `to` (YYYY-MM-DD) includes the whole day. */
function endOf(value: string): Date {
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}

export function buildAuditEventsWhere({
  organizationId,
  query,
}: {
  organizationId: string;
  query: AuditEventsQueryDto;
}): Prisma.AuditLogWhereInput {
  const timestamp: Prisma.DateTimeFilter = {};
  if (query.from) timestamp.gte = new Date(query.from);
  if (query.to) timestamp.lte = endOf(query.to);

  return {
    organizationId,
    ...(query.userId && { userId: query.userId }),
    ...(query.resource && {
      data: { path: ['resource'], equals: query.resource },
    }),
    ...((query.from || query.to) && { timestamp }),
    ...(query.search && {
      OR: [
        { description: { contains: query.search, mode: 'insensitive' } },
        // Record name + changed field names, stored lowercased by the interceptor.
        { data: { path: ['searchText'], string_contains: query.search.toLowerCase() } },
      ],
    }),
  };
}

export interface AuditEventRow {
  id: string;
  timestamp: Date;
  description: string | null;
  entityType: string | null;
  entityId: string | null;
  data: Prisma.JsonValue;
  user: { name: string | null; email: string } | null;
}

function dataField(data: Prisma.JsonValue, key: string): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const value = data[key];
  return typeof value === 'string' ? value : '';
}

export const AUDIT_EVENT_CSV_HEADERS = [
  'Timestamp (UTC)',
  'User',
  'Email',
  'Event',
  'Resource',
  'Target type',
  'Target ID',
  'Method',
  'Path',
  'IP address',
  'User agent',
  'Sign-in method',
  'Outcome',
  'Changes',
];

const show = (value: unknown) =>
  value === null || value === undefined || value === ''
    ? '—'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

/** "field: old → new; …" from the interceptor's `changes` record. */
export function formatChanges(data: Prisma.JsonValue): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const changes = data.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return '';
  return Object.entries(changes)
    .map(([field, change]) => {
      if (!change || typeof change !== 'object' || Array.isArray(change)) return field;
      return `${field}: ${show(change.previous)} → ${show(change.current)}`;
    })
    .join('; ');
}

function outcome(data: Prisma.JsonValue): string {
  const value = dataField(data, 'outcome');
  if (value !== 'failure') return 'success';
  const status =
    data && typeof data === 'object' && !Array.isArray(data) ? data.statusCode : null;
  return typeof status === 'number' ? `failure (${status})` : 'failure';
}

export function auditEventsToCsv(rows: AuditEventRow[]): string {
  return [
    toCsvRow(AUDIT_EVENT_CSV_HEADERS),
    ...rows.map((row) =>
      toCsvRow([
        row.timestamp.toISOString(),
        row.user?.name ?? '',
        row.user?.email ?? '',
        row.description ?? dataField(row.data, 'action'),
        dataField(row.data, 'resource'),
        row.entityType ?? '',
        row.entityId ?? '',
        dataField(row.data, 'method'),
        dataField(row.data, 'path'),
        dataField(row.data, 'ipAddress'),
        dataField(row.data, 'userAgent'),
        dataField(row.data, 'signInMethod'),
        outcome(row.data),
        formatChanges(row.data),
      ]),
    ),
  ].join('\n');
}
