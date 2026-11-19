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
  scopeJustification: string | null;
  location: string | null;
  vendorId: string | null;
  vendor: { id: string; name: string } | null;
  version: string | null;
  endOfSupportAt: string | null;
  lastReviewedAt: string | null;
  lastScannedAt: string | null;
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
  scopeJustification?: string | null;
  location?: string | null;
  vendorId?: string | null;
  version?: string | null;
  endOfSupportAt?: string | null;
}

export interface InventoryReview {
  lastReviewedAt: string | null;
  reviewedBy: { id: string; name: string | null; email: string } | null;
}

/** Rows of the latest Infrastructure Inventory form submission available to import. */
export interface FormImportPreview {
  rows: number;
  submittedAt: string;
  imported: number;
}

export interface AssetsResponse {
  data: Asset[];
  review: InventoryReview;
  formImport: FormImportPreview | null;
}

export interface AssetImportResult {
  created: number;
  updated: number;
  total: number;
}

export const assetsKey = '/v1/assets';

async function unwrap<T>(promise: Promise<{ data?: T; error?: string }>): Promise<T | undefined> {
  const res = await promise;
  if (res.error) throw new Error(res.error);
  return res.data;
}

const EMPTY_REVIEW: InventoryReview = { lastReviewedAt: null, reviewedBy: null };

/** The system inventory with create / update / delete, imports, review and "refresh from integrations". */
export function useAssets({ initialData }: { initialData?: AssetsResponse } = {}) {
  const { data, error, isLoading, mutate } = useSWR(
    assetsKey,
    async (): Promise<AssetsResponse> => {
      const res = await unwrap(apiClient.get<AssetsResponse>(assetsKey));
      return {
        data: Array.isArray(res?.data) ? res.data : [],
        review: res?.review ?? EMPTY_REVIEW,
        formImport: res?.formImport ?? null,
      };
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

  const importFromForm = async () => {
    const result = await unwrap(apiClient.post<AssetImportResult>(`${assetsKey}/import-from-form`));
    await mutate();
    return result;
  };
  const importCsv = async (csv: string) => {
    const result = await unwrap(apiClient.post<AssetImportResult>(`${assetsKey}/import`, { csv }));
    await mutate();
    return result;
  };
  const markReviewed = async () => {
    await unwrap(apiClient.post<InventoryReview>(`${assetsKey}/review`));
    await mutate();
  };

  return {
    assets: Array.isArray(data?.data) ? data.data : [],
    review: data?.review ?? EMPTY_REVIEW,
    formImport: data?.formImport ?? null,
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    create,
    update,
    remove,
    sync,
    importFromForm,
    importCsv,
    markReviewed,
  };
}
