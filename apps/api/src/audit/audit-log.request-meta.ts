import { AuditLogEntityType } from '@db';
import type { ChangesRecord } from './audit-log.utils';

/** What a route is about, for endpoints whose permission resource is too generic (e.g. `member`, `audit`). */
export interface RouteLabel {
  /** Stored as `data.resource`; the event log filters on it. */
  resource: string;
  /** Noun used in the description, e.g. "Updated access review". */
  label: string;
  entityType: AuditLogEntityType;
}

/** First path segment after `/v1/` → label. Keep in sync with the backfill in the shell_round2 migration. */
export const ROUTE_LABELS: Record<string, RouteLabel> = {
  'access-reviews': {
    resource: 'access-reviews',
    label: 'access review',
    entityType: AuditLogEntityType.people,
  },
  access: {
    resource: 'access-reviews',
    label: 'system access',
    entityType: AuditLogEntityType.people,
  },
  assets: {
    resource: 'assets',
    label: 'asset',
    entityType: AuditLogEntityType.integration,
  },
  vulnerabilities: {
    resource: 'vulnerabilities',
    label: 'vulnerability',
    entityType: AuditLogEntityType.integration,
  },
  isms: {
    resource: 'isms',
    label: 'ISMS document',
    entityType: AuditLogEntityType.organization,
  },
  roles: {
    resource: 'roles',
    label: 'role',
    entityType: AuditLogEntityType.people,
  },
  training: {
    resource: 'training',
    label: 'training',
    entityType: AuditLogEntityType.people,
  },
  audits: {
    resource: 'audits',
    label: 'audit',
    entityType: AuditLogEntityType.framework,
  },
  questionnaire: {
    resource: 'questionnaires',
    label: 'questionnaire',
    entityType: AuditLogEntityType.organization,
  },
  soa: {
    resource: 'soa',
    label: 'Statement of Applicability',
    entityType: AuditLogEntityType.framework,
  },
};

export function routeLabel(path: string): RouteLabel | null {
  const segment = path.split('?')[0]?.match(/\/v\d+\/([^/]+)/)?.[1];
  return segment ? (ROUTE_LABELS[segment] ?? null) : null;
}

interface RequestLike {
  // Express' IncomingHttpHeaders or the Fetch `Headers` the auth types declare.
  headers?: object;
  ip?: string;
}

const header = (request: RequestLike, name: string): string | undefined => {
  const headers = request.headers;
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const value = (headers as Record<string, unknown>)[name];
  if (Array.isArray(value))
    return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
};

/** Client IP (first x-forwarded-for hop, else the socket) and user agent, for PCI DSS 10.2.2. */
export function requestMeta(request: RequestLike): {
  ipAddress?: string;
  userAgent?: string;
} {
  const forwarded = header(request, 'x-forwarded-for')?.split(',')[0]?.trim();
  const ipAddress = forwarded || request.ip || undefined;
  const userAgent = header(request, 'user-agent')?.slice(0, 300) || undefined;
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

/** Name or title of the affected record, from the response body when there is one. */
export function entityName(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== 'object') return null;
  const body = responseBody as Record<string, unknown>;
  const value = body.name ?? body.title ?? body.filename;
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 200)
    : null;
}

/** Lowercased text the event log search matches besides the description. */
export function searchText({
  name,
  changes,
}: {
  name: string | null;
  changes: ChangesRecord | null;
}): string | null {
  const text = [name, ...Object.keys(changes ?? {})]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return text || null;
}

/** HTTP status of a thrown error (Nest HttpException or anything with a status). */
export function errorStatus(error: unknown): number {
  if (error && typeof error === 'object') {
    const e = error as { getStatus?: () => number; status?: unknown };
    if (typeof e.getStatus === 'function') return e.getStatus();
    if (typeof e.status === 'number') return e.status;
  }
  return 500;
}
