import type { AuditLogWithRelations } from '@/hooks/use-audit-logs';

/**
 * One timeline for a control: its own events (owner, links) plus applicability
 * changes on the requirements it maps to, newest first.
 */
export function mergeControlHistory({
  controlLogs,
  frameworkLogs,
  requirementKeys,
}: {
  controlLogs: AuditLogWithRelations[];
  frameworkLogs: AuditLogWithRelations[];
  requirementKeys: string[];
}): AuditLogWithRelations[] {
  const keys = new Set(requirementKeys);
  const applicability = frameworkLogs.filter((log) => {
    const path = (log.data as { path?: unknown } | null)?.path;
    if (typeof path !== 'string') return false;
    const match = path.match(/\/requirements\/([^/]+)\/applicability/);
    return !!match && keys.has(match[1]);
  });
  const seen = new Set<string>();
  return [...controlLogs, ...applicability]
    .filter((log) => !seen.has(log.id) && seen.add(log.id))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
