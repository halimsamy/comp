'use client';

import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';

export type AssetType =
  | 'computer'
  | 'compute'
  | 'container'
  | 'serverless'
  | 'database'
  | 'storage'
  | 'network'
  | 'repository'
  | 'key_secret'
  | 'messaging'
  | 'cloud_account'
  | 'application'
  | 'other';
export type AssetSource = 'integration' | 'device' | 'manual';
export type AssetEnvironment = 'production' | 'staging' | 'development' | 'test' | 'unknown';
export type AssetCdeScope = 'unassessed' | 'in_scope' | 'connected' | 'out_of_scope';
export type AssetDataClassification =
  'unclassified' | 'public' | 'internal' | 'confidential' | 'restricted';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  source: AssetSource;
  providerSlug: string | null;
  externalId: string;
  resourceType: string | null;
  environment: AssetEnvironment;
  cdeScope: AssetCdeScope;
  dataClassification: AssetDataClassification;
  ownerId: string | null;
  owner: { id: string; name: string | null; email: string } | null;
  description: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  archivedAt: string | null;
  openVulnerabilities: number;
}

export interface AssetPayload {
  name?: string;
  type?: AssetType;
  environment?: AssetEnvironment;
  cdeScope?: AssetCdeScope;
  dataClassification?: AssetDataClassification;
  ownerId?: string | null;
  description?: string | null;
}

export const assetsKey = '/v1/assets';

async function unwrap<T>(promise: Promise<{ data?: T; error?: string }>): Promise<T | undefined> {
  const res = await promise;
  if (res.error) throw new Error(res.error);
  return res.data;
}

/** The system inventory with create / update / delete and "refresh from integrations". */
export function useAssets({ initialData }: { initialData?: Asset[] } = {}) {
  const { data, error, isLoading, mutate } = useSWR(
    assetsKey,
    async () => {
      const res = await unwrap(apiClient.get<{ data: Asset[] }>(assetsKey));
      return Array.isArray(res?.data) ? res.data : [];
    },
    { fallbackData: initialData, revalidateOnMount: !initialData, revalidateOnFocus: false },
  );

  const create = async (payload: AssetPayload) => {
    await unwrap(apiClient.post(assetsKey, payload));
    await mutate();
  };
  const update = async ({ id, payload }: { id: string; payload: AssetPayload }) => {
    await unwrap(apiClient.patch(`${assetsKey}/${id}`, payload));
    await mutate();
  };
  const remove = async (id: string) => {
    await unwrap(apiClient.delete(`${assetsKey}/${id}`));
    await mutate();
  };
  const sync = async () => {
    const result = await unwrap(
      apiClient.post<{ assets: number; vulnerabilities: number }>(`${assetsKey}/sync`),
    );
    await mutate();
    return result;
  };

  return {
    assets: Array.isArray(data) ? data : [],
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    create,
    update,
    remove,
    sync,
  };
}
