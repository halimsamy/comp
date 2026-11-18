'use client';

import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';
import type { AssetCdeScope, AssetEnvironment, AssetType } from './use-assets';

export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type VulnerabilityStatus = 'open' | 'resolved' | 'ignored';
export type VulnerabilitySource = 'integration' | 'asv_scan' | 'pentest' | 'manual';
export type SlaStatus = 'overdue' | 'due_soon' | 'due_later' | 'no_sla' | 'closed';

export interface Vulnerability {
  id: string;
  title: string;
  description: string | null;
  remediation: string | null;
  severity: VulnerabilitySeverity;
  status: VulnerabilityStatus;
  statusNote: string | null;
  source: VulnerabilitySource;
  cveId: string | null;
  resourceType: string;
  resourceId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  slaDueAt: string | null;
  slaStatus: SlaStatus;
  provider: { slug: string; name: string } | null;
  asset: {
    id: string;
    name: string;
    type: AssetType;
    cdeScope: AssetCdeScope;
    environment: AssetEnvironment;
  } | null;
  owner: { id: string; name: string | null; email: string } | null;
}

export interface CreateVulnerabilityPayload {
  title: string;
  severity: VulnerabilitySeverity;
  assetId?: string;
  resource?: string;
  cveId?: string;
  description?: string;
  firstSeenAt?: string;
}

export interface UpdateVulnerabilityPayload {
  status?: VulnerabilityStatus;
  ownerId?: string | null;
  statusNote?: string | null;
}

export interface ImportVulnerabilitiesPayload {
  source: 'asv_scan' | 'pentest';
  csv: string;
  resolveMissing: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  reopened: number;
  resolved: number;
  skipped: number;
}

export const vulnerabilitiesKey = '/v1/vulnerabilities';

async function unwrap<T>(promise: Promise<{ data?: T; error?: string }>): Promise<T | undefined> {
  const res = await promise;
  if (res.error) throw new Error(res.error);
  return res.data;
}

/** Vulnerability store: integration, ASV, pentest and manual findings with SLA status. */
export function useVulnerabilities({ initialData }: { initialData?: Vulnerability[] } = {}) {
  const { data, error, isLoading, mutate } = useSWR(
    vulnerabilitiesKey,
    async () => {
      const res = await unwrap(apiClient.get<{ data: Vulnerability[] }>(vulnerabilitiesKey));
      return Array.isArray(res?.data) ? res.data : [];
    },
    { fallbackData: initialData, revalidateOnMount: !initialData, revalidateOnFocus: false },
  );

  const create = async (payload: CreateVulnerabilityPayload) => {
    await unwrap(apiClient.post(vulnerabilitiesKey, payload));
    await mutate();
  };
  const update = async ({ id, payload }: { id: string; payload: UpdateVulnerabilityPayload }) => {
    await unwrap(apiClient.patch(`${vulnerabilitiesKey}/${id}`, payload));
    await mutate();
  };
  const importCsv = async (payload: ImportVulnerabilitiesPayload) => {
    const result = await unwrap(
      apiClient.post<ImportResult>(`${vulnerabilitiesKey}/import`, payload),
    );
    await mutate();
    return result;
  };

  /** Rebuild integration findings (and the asset inventory) from the latest scan results. */
  const sync = async () => {
    const result = await unwrap(
      apiClient.post<{ assets: number; vulnerabilities: number }>('/v1/assets/sync'),
    );
    await mutate();
    return result;
  };

  return {
    vulnerabilities: Array.isArray(data) ? data : [],
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    create,
    update,
    importCsv,
    sync,
  };
}
