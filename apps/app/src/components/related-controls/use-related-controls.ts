'use client';

import {
  controlsOverviewKey,
  type ControlOwner,
  type FrameworkRequirements,
} from '@/hooks/use-controls-overview';
import { apiClient } from '@/lib/api-client';
import useSWR, { useSWRConfig } from 'swr';

export type RelatedEntityType = 'policy' | 'task' | 'evidence_form' | 'isms_document';

export interface RelatedControl {
  id: string;
  name: string;
  description: string;
  owner: ControlOwner | null;
  /** Only the frameworks this link counts for. */
  frameworks: FrameworkRequirements[];
}

export function relatedControlsKey({
  entityType,
  entityId,
}: {
  entityType: RelatedEntityType;
  entityId: string;
}) {
  return `/v1/controls/related?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`;
}

/** Controls a policy, task, evidence form or ISMS document is linked to, with their codes. */
export function useRelatedControls({
  entityType,
  entityId,
  enabled = true,
}: {
  entityType: RelatedEntityType;
  entityId: string;
  enabled?: boolean;
}) {
  const { mutate: globalMutate } = useSWRConfig();
  const key = relatedControlsKey({ entityType, entityId });
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? key : null,
    async () => {
      const res = await apiClient.get<{ data: RelatedControl[] }>(key);
      if (res.error) throw new Error(res.error);
      return res.data?.data ?? [];
    },
    { revalidateOnFocus: false },
  );

  const refresh = async () => {
    await Promise.all([mutate(), globalMutate(controlsOverviewKey)]);
  };

  const link = async (controlIds: string[]) => {
    const res = await apiClient.post('/v1/controls/related', { entityType, entityId, controlIds });
    if (res.error) throw new Error(res.error);
    await refresh();
  };

  const unlink = async (controlId: string) => {
    const query = `entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`;
    const res = await apiClient.delete(`/v1/controls/related/${controlId}?${query}`);
    if (res.error) throw new Error(res.error);
    await refresh();
  };

  return {
    controls: Array.isArray(data) ? data : [],
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    link,
    unlink,
  };
}
