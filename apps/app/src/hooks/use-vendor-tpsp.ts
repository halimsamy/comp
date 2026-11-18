'use client';

import { useApi } from '@/hooks/use-api';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { ApiResponse } from '@/lib/api-client';
import { fileToBase64 } from '@/lib/file-utils';
import type {
  VendorCriticality,
  VendorDocumentSummaryStatus,
  VendorDocumentType,
  VendorReviewOutcome,
} from '@db';
import { useCallback } from 'react';
import type { SWRResponse } from 'swr';

/** AI summary of an assurance report (see the API vendor-document-summary job). */
export interface VendorDocumentAiSummary {
  reportType: string;
  auditor: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  expiresAt: string | null;
  opinion: string;
  scope: string;
  exceptions: { control: string; description: string }[];
  complementaryUserEntityControls: string[];
  subserviceOrganizations: string[];
  keyRisks: string[];
  summary: string;
}

export interface VendorDocument {
  id: string;
  vendorId: string;
  type: VendorDocumentType;
  name: string;
  periodStart: string | null;
  periodEnd: string | null;
  expiresAt: string | null;
  expiringSoon: boolean;
  aiSummary: VendorDocumentAiSummary | null;
  aiSummaryStatus: VendorDocumentSummaryStatus | null;
  createdAt: string;
  attachment: { name: string; type: string; createdAt: string };
}

export interface VendorReviewChecklist {
  assuranceReviewed: boolean;
  pciStatusConfirmed: boolean;
  contractReviewed: boolean;
  riskReassessed: boolean;
}

export interface VendorReview {
  id: string;
  outcome: VendorReviewOutcome;
  notes: string | null;
  checklist: VendorReviewChecklist;
  criticality: VendorCriticality | null;
  reviewedByName: string;
  reviewedAt: string;
  nextReviewDue: string;
}

export interface UploadVendorDocumentInput {
  file: File;
  type: VendorDocumentType;
  name?: string;
  periodStart?: string;
  periodEnd?: string;
  expiresAt?: string;
}

export interface SignOffVendorReviewInput {
  outcome: VendorReviewOutcome;
  checklist: VendorReviewChecklist;
  notes?: string;
  nextReviewDue?: string;
}

interface ListResponse<T> {
  data: T[];
  count: number;
}

/** Reads API failures from both swr.error and ApiResponse.error. */
function listState<T>(swr: SWRResponse<ApiResponse<ListResponse<T>>, Error>) {
  const apiError = swr.data?.error ? new Error(swr.data.error) : null;
  const error = swr.error ?? apiError;
  const items = error ? [] : (swr.data?.data?.data ?? []);
  return { items: Array.isArray(items) ? items : [], error };
}

export function useVendorDocuments(vendorId: string | null) {
  const api = useApi();
  const endpoint = vendorId ? `/v1/vendors/${vendorId}/documents` : null;
  const swr = useApiSWR<ListResponse<VendorDocument>>(endpoint, {
    // Poll while an AI summary is running so the result appears on its own.
    refreshInterval: (latest) =>
      latest?.data?.data?.some((doc) => doc.aiSummaryStatus === 'pending') ? 4000 : 0,
  });
  const { items: documents, error } = listState(swr);

  const run = useCallback(
    async <T>(request: (base: string) => Promise<{ data?: T; error?: string }>) => {
      if (!endpoint) throw new Error('No vendor selected');
      const response = await request(endpoint);
      if (response.error) throw new Error(response.error);
      await swr.mutate();
      return response.data;
    },
    [endpoint, swr],
  );

  const uploadDocument = useCallback(
    async (input: UploadVendorDocumentInput) => {
      const fileData = await fileToBase64(input.file);
      return run((base) =>
        api.post<VendorDocument>(base, {
          type: input.type,
          name: input.name || undefined,
          periodStart: input.periodStart || undefined,
          periodEnd: input.periodEnd || undefined,
          expiresAt: input.expiresAt || undefined,
          fileName: input.file.name,
          fileType: input.file.type || 'application/octet-stream',
          fileData,
        }),
      );
    },
    [api, run],
  );

  const deleteDocument = useCallback(
    (documentId: string) => run((base) => api.delete(`${base}/${documentId}`)),
    [api, run],
  );

  const summarizeDocument = useCallback(
    (documentId: string) =>
      run((base) => api.post<VendorDocument>(`${base}/${documentId}/summarize`, {})),
    [api, run],
  );

  const getDownloadUrl = useCallback(
    async (documentId: string) => {
      const response = await api.get<{ downloadUrl: string }>(`${endpoint}/${documentId}/download`);
      if (response.error || !response.data) {
        throw new Error(response.error ?? 'Download failed');
      }
      return response.data.downloadUrl;
    },
    [api, endpoint],
  );

  return {
    documents,
    error,
    isLoading: swr.isLoading,
    mutate: swr.mutate,
    uploadDocument,
    deleteDocument,
    summarizeDocument,
    getDownloadUrl,
  };
}

export function useVendorReviews(vendorId: string | null) {
  const api = useApi();
  const endpoint = vendorId ? `/v1/vendors/${vendorId}/reviews` : null;
  const swr = useApiSWR<ListResponse<VendorReview>>(endpoint);
  const { items: reviews, error } = listState(swr);

  const signOffReview = useCallback(
    async (input: SignOffVendorReviewInput) => {
      if (!endpoint) throw new Error('No vendor to review');
      const response = await api.post<VendorReview>(endpoint, input);
      if (response.error) throw new Error(response.error);
      await swr.mutate();
      return response.data;
    },
    [api, endpoint, swr],
  );

  return { reviews, error, isLoading: swr.isLoading, mutate: swr.mutate, signOffReview };
}
