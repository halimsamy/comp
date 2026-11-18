'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';
import type { ChartEdge, ChartNode } from '../lib/org-chart-svg';

export interface OrgChartSnapshotSummary {
  id: string;
  name: string;
  createdAt: string;
  nodeCount: number;
}

interface OrgChartSnapshotDetail extends OrgChartSnapshotSummary {
  nodes: ChartNode[];
  edges: ChartEdge[];
}

export function useOrgChartSnapshots() {
  const { data, mutate, isLoading } = useApiSWR<OrgChartSnapshotSummary[]>('/v1/org-chart/snapshots');

  const createSnapshot = useCallback(
    async (name?: string) => {
      const res = await apiClient.post('/v1/org-chart/snapshots', name ? { name } : {});
      if (res.error) throw new Error(res.error);
      await mutate();
    },
    [mutate],
  );

  const getSnapshot = useCallback(async (id: string) => {
    const res = await apiClient.get<OrgChartSnapshotDetail>(`/v1/org-chart/snapshots/${id}`);
    if (res.error || !res.data) throw new Error(res.error ?? 'Snapshot not found');
    return {
      ...res.data,
      nodes: Array.isArray(res.data.nodes) ? res.data.nodes : [],
      edges: Array.isArray(res.data.edges) ? res.data.edges : [],
    };
  }, []);

  return {
    snapshots: Array.isArray(data?.data) ? data.data : [],
    isLoading,
    createSnapshot,
    getSnapshot,
  };
}
