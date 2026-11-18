'use client';

import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';

export interface FrameworkRequirements {
  frameworkInstanceId: string;
  frameworkName: string;
  requirements: { identifier: string; name: string }[];
}

export interface ControlOwner {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** The owner left the company: the control needs reassignment. */
  deactivated: boolean;
}

export type ControlEvidenceStatus = 'completed' | 'in_progress' | 'not_started' | 'no_evidence';

export interface EvidenceTally {
  total: number;
  completed: number;
}

export interface ControlOverview {
  id: string;
  name: string;
  description: string;
  owner: ControlOwner | null;
  frameworks: FrameworkRequirements[];
  evidence: {
    policies: EvidenceTally;
    tasks: EvidenceTally;
    forms: EvidenceTally;
    ismsDocuments: EvidenceTally;
  };
  status: ControlEvidenceStatus;
}

export const controlsOverviewKey = '/v1/controls/overview';

/**
 * Every control with its ISO / PCI requirement codes, owner and evidence status.
 * Pass `enabled: false` to defer the fetch (e.g. until a picker opens).
 */
export function useControlsOverview({
  initialData,
  enabled = true,
}: { initialData?: ControlOverview[]; enabled?: boolean } = {}) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? controlsOverviewKey : null,
    async () => {
      const res = await apiClient.get<{ data: ControlOverview[] }>(controlsOverviewKey);
      if (res.error) throw new Error(res.error);
      return res.data?.data ?? [];
    },
    { fallbackData: initialData, revalidateOnMount: !initialData, revalidateOnFocus: false },
  );

  const setOwner = async ({ controlId, ownerId }: { controlId: string; ownerId: string | null }) => {
    const res = await apiClient.patch(`/v1/controls/${controlId}/owner`, { ownerId });
    if (res.error) throw new Error(res.error);
    await mutate();
  };

  return {
    controls: Array.isArray(data) ? data : [],
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    mutate,
    setOwner,
  };
}
