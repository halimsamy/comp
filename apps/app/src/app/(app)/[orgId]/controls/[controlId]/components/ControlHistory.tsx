'use client';

import { RecentAuditLogs } from '@/components/RecentAuditLogs';
import { useAuditLogs } from '@/hooks/use-audit-logs';
import { Text } from '@trycompai/design-system';
import { mergeControlHistory } from './control-history';

export function ControlHistory({
  controlId,
  frameworkInstanceIds,
  requirementKeys,
}: {
  controlId: string;
  frameworkInstanceIds: string[];
  requirementKeys: string[];
}) {
  const control = useAuditLogs({ entityType: 'control', entityId: controlId });
  // shortcut: only the latest 50 applicability events per framework set are scanned; page if history grows.
  const frameworks = useAuditLogs({
    entityType: 'framework',
    entityId: [...new Set(frameworkInstanceIds)].join(',') || 'none',
    pathContains: '/applicability',
  });

  if (control.error) {
    return <Text size="sm" variant="destructive">Could not load history.</Text>;
  }
  if (control.isLoading) {
    return <Text size="sm" variant="muted">Loading history…</Text>;
  }
  const logs = mergeControlHistory({
    controlLogs: control.logs,
    frameworkLogs: frameworks.logs,
    requirementKeys,
  });
  return <RecentAuditLogs logs={logs} title="History" />;
}
