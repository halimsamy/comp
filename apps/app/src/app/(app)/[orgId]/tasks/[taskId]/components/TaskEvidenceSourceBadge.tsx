'use client';

import { api } from '@/lib/api-client';
import { Badge } from '@trycompai/design-system';
import useSWR from 'swr';
import { useTaskNativeEvidence } from '../hooks/use-task-native-evidence';
import { integrationChecksKey, type TaskIntegrationCheck } from '../hooks/useIntegrationChecks';

export type EvidenceSource = 'automated' | 'auto_evidence' | null;

/**
 * #54: "Automated" only when something actually collects evidence (an enabled
 * automation or a connected integration check), "Auto-evidence" when a
 * platform-records rule can prove the task, otherwise no badge.
 */
export function evidenceSource({
  hasActiveAutomation,
  hasNativeRule,
}: {
  hasActiveAutomation: boolean;
  hasNativeRule: boolean;
}): EvidenceSource {
  if (hasActiveAutomation) return 'automated';
  return hasNativeRule ? 'auto_evidence' : null;
}

export function TaskEvidenceSourceBadge({
  taskId,
  orgId,
  automations,
}: {
  taskId: string;
  orgId: string;
  automations: Array<{ isEnabled: boolean }>;
}) {
  const { evidence } = useTaskNativeEvidence({ taskId });
  // Same key and request as useIntegrationChecks, so the Automations tab reuses it.
  const { data: checks } = useSWR(
    integrationChecksKey(taskId, orgId),
    async () => {
      const response = await api.get<{ checks: TaskIntegrationCheck[] }>(
        `/v1/integrations/tasks/${taskId}/checks?organizationId=${orgId}`,
      );
      if (response.error) throw new Error(response.error);
      return response.data?.checks ?? [];
    },
    { revalidateOnFocus: false },
  );
  const source = evidenceSource({
    hasActiveAutomation:
      automations.some((a) => a.isEnabled) ||
      (Array.isArray(checks) && checks.some((c) => c.isConnected && !c.isDisabledForTask)),
    hasNativeRule: !!evidence,
  });

  if (source === 'automated') return <Badge variant="accent">Automated</Badge>;
  if (source === 'auto_evidence') return <Badge variant="secondary">Auto-evidence</Badge>;
  return null;
}
