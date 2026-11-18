'use client';

import { api } from '@/lib/api-client';
import useSWR from 'swr';
import type { IsmsDocumentStatus, IsmsDocumentType } from '../isms-types';

export interface IsmsDocumentReadiness {
  type: IsmsDocumentType;
  documentId: string;
  status: IsmsDocumentStatus;
  checks: Array<{ label: string; done: boolean }>;
  percent: number;
  missing: string[];
}

export interface IsmsReadiness {
  percent: number;
  documents: IsmsDocumentReadiness[];
  nonconformities: { open: number; overdue: number };
}

/** Per-clause "what's missing" checklist, computed by the API on every read. */
export function useIsmsReadiness({
  organizationId,
  frameworkId,
}: {
  organizationId: string;
  frameworkId: string | null;
}) {
  const { data, error, isLoading, mutate } = useSWR<IsmsReadiness>(
    frameworkId ? (['/v1/isms/readiness', organizationId, frameworkId] as const) : null,
    async ([endpoint, orgId, id]: readonly [string, string, string]) => {
      const response = await api.get<IsmsReadiness>(
        `${endpoint}?frameworkId=${encodeURIComponent(id)}`,
        orgId,
      );
      if (response.error || !response.data) {
        throw new Error(response.error ?? 'Failed to load ISMS progress');
      }
      return response.data;
    },
  );

  /** One-click refresh: re-derive every draft from platform data. */
  const refreshDrafts = async () => {
    if (!frameworkId) return;
    const response = await api.post(
      '/v1/isms/generate-all',
      { frameworkId, draftsOnly: true },
      organizationId,
    );
    if (response.error) throw new Error(response.error);
    await mutate();
  };

  return { readiness: data, error, isLoading, mutate, refreshDrafts };
}
