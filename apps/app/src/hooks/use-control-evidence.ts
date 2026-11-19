'use client';

import { useApiSWR } from '@/hooks/use-api-swr';

export type EvidenceKind = 'policy' | 'task' | 'form' | 'isms_document';
export type EvidenceState = 'complete' | 'in_progress' | 'missing' | 'not_relevant';

/** Mirrors ControlEvidenceItem in apps/api/src/controls/controls-evidence.ts. */
export interface ControlEvidenceItem {
  kind: EvidenceKind;
  id: string;
  name: string;
  status: string;
  state: EvidenceState;
  owner: string | null;
  updatedAt: string | null;
  type?: string;
  controlIds: string[];
}

/** Merged policies, tasks, forms and ISMS documents behind the given controls. */
export function useControlEvidence(controlIds: string[]) {
  const ids = [...new Set(controlIds)].sort().slice(0, 200);
  const { data, error, isLoading, mutate } = useApiSWR<{ data: ControlEvidenceItem[] }>(
    ids.length > 0 ? `/v1/controls/evidence?controlIds=${ids.join(',')}` : null,
  );
  const items = Array.isArray(data?.data?.data) ? data.data.data : [];
  return {
    items,
    error: error ?? (data?.error ? new Error(data.error) : undefined),
    isLoading: ids.length > 0 && isLoading,
    mutate,
  };
}

/** Counts evidence that is done, ignoring items marked not relevant. */
export function summarizeEvidence(items: ControlEvidenceItem[]) {
  const relevant = items.filter((i) => i.state !== 'not_relevant');
  return {
    complete: relevant.filter((i) => i.state === 'complete').length,
    total: relevant.length,
  };
}
