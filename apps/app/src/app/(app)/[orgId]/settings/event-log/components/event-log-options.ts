/** Event types an admin can filter by (the `resource` recorded on each audit row). */
export const EVENT_TYPE_OPTIONS = [
  { value: 'all', label: 'All events' },
  { value: 'auth', label: 'Sign-ins and sessions' },
  { value: 'organization', label: 'Organization settings' },
  { value: 'member', label: 'People and roles' },
  { value: 'policy', label: 'Policies' },
  { value: 'control', label: 'Controls' },
  { value: 'task', label: 'Tasks' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'risk', label: 'Risks' },
  { value: 'vendor', label: 'Vendors' },
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
