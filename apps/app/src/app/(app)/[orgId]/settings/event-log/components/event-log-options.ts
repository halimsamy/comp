/** Event types an admin can filter by (the `resource` recorded on each audit row). */
export const EVENT_TYPE_OPTIONS = [
  { value: 'all', label: 'All events' },
  { value: 'auth', label: 'Sign-ins and sessions' },
  { value: 'organization', label: 'Organization settings' },
  { value: 'member', label: 'People' },
  { value: 'roles', label: 'Roles' },
  { value: 'access-reviews', label: 'Access reviews' },
  { value: 'training', label: 'Training' },
  { value: 'policy', label: 'Policies' },
  { value: 'control', label: 'Controls' },
  { value: 'task', label: 'Tasks' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'isms', label: 'ISMS' },
  { value: 'soa', label: 'Statement of Applicability' },
  { value: 'audits', label: 'Audits' },
  { value: 'risk', label: 'Risks' },
  { value: 'vendor', label: 'Vendors' },
  { value: 'assets', label: 'Assets' },
  { value: 'vulnerabilities', label: 'Vulnerabilities' },
  { value: 'questionnaires', label: 'Questionnaires' },
  { value: 'integration', label: 'Integrations' },
  { value: 'trust', label: 'Trust center' },
  { value: 'apiKey', label: 'API keys' },
  { value: 'admin', label: 'Platform admin' },
] as const;

export function eventTypeLabel(resource: unknown): string {
  const match = EVENT_TYPE_OPTIONS.find((o) => o.value === resource);
  if (match && match.value !== 'all') return match.label;
  return typeof resource === 'string' ? resource : '—';
}

export function readDataString(data: Record<string, unknown> | null, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value ? value : null;
}

export interface FieldChange {
  field: string;
  previous: unknown;
  current: unknown;
}

/** The interceptor's `changes` record as a list (`{ field: { previous, current } }`). */
export function readChanges(data: Record<string, unknown> | null): FieldChange[] {
  const changes = data?.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return [];
  return Object.entries(changes as Record<string, unknown>).map(([field, change]) => {
    const c = change && typeof change === 'object' ? (change as Record<string, unknown>) : {};
    return { field, previous: c.previous, current: c.current };
  });
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

const FAILURE_EVENTS = new Set(['sign_in_failed', 'session_idle_expired']);

/** Failed sign-ins, idle timeouts and rejected changes are shown in red. */
export function isFailureEvent(data: Record<string, unknown> | null): boolean {
  if (readDataString(data, 'outcome') === 'failure') return true;
  const permission = readDataString(data, 'permission');
  return (
    readDataString(data, 'resource') === 'auth' && !!permission && FAILURE_EVENTS.has(permission)
  );
}

export function formatEventTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
