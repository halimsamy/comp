'use client';

import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';
import useSWR from 'swr';

interface Person {
  id: string;
  user: { id: string; name: string | null; email: string };
}

export interface PolicyReview {
  id: string;
  reviewedAt: string;
  notes: string | null;
  nextReviewDate: string;
  reviewer: Person | null;
  policyVersion: { id: string; version: number } | null;
}

export interface PolicyAcknowledgementMember {
  memberId: string;
  name: string;
  email: string;
  department: string;
  status: 'acknowledged' | 'pending';
  acknowledgedAt: string | null;
  lastAcknowledgedAt: string | null;
  lastAcknowledgedVersion: number | null;
  lastRemindedAt: string | null;
}

export interface PolicyAcknowledgementHistoryItem {
  id: string;
  policyId: string;
  policyName: string;
  policyVersionId: string | null;
  version: number | null;
  memberId: string | null;
  memberName: string;
  memberEmail: string;
  acknowledgedAt: string;
}

export interface PolicyAcknowledgements {
  policyId: string;
  policyName: string;
  isRequiredToSign: boolean;
  status: string;
  /** False until a version has been approved: nothing to acknowledge yet. */
  inForce: boolean;
  currentVersion: { id: string; version: number } | null;
  summary: { total: number; acknowledged: number; pending: number };
  members: PolicyAcknowledgementMember[];
  history: PolicyAcknowledgementHistoryItem[];
}

export interface DocumentControl {
  policyName: string;
  organizationName: string;
  primaryColor: string | null;
  logo: { dataUrl: string; format: 'PNG' | 'JPEG' } | null;
  rows: { label: string; value: string }[];
  revisions?: { version: string; date: string; approvedBy: string; changes: string }[];
}

export interface PolicyReminderResult {
  sent: number;
  alreadyRemindedToday: number;
  unsubscribed: number;
  failed: number;
  pending: number;
}

export const policyReviewsKey = (policyId: string) =>
  ['/v1/policies/reviews', policyId] as const;
export const policyAcknowledgementsKey = (policyId: string) =>
  ['/v1/policies/acknowledgements', policyId] as const;

async function unwrap<T>(promise: Promise<{ data?: T; error?: string }>): Promise<T> {
  const response = await promise;
  if (response.error || response.data === undefined) {
    throw new Error(response.error ?? 'Request failed');
  }
  return response.data;
}

export function usePolicyReviews({ policyId }: { policyId: string }) {
  const { data, error, isLoading, mutate } = useSWR(policyReviewsKey(policyId), async () => {
    const body = await unwrap(
      apiClient.get<{ data: PolicyReview[] }>(`/v1/policies/${policyId}/reviews`),
    );
    return Array.isArray(body.data) ? body.data : [];
  });

  const recordReview = useCallback(
    async (input: { notes?: string; nextReviewDate?: string; requireReacknowledgement?: boolean }) => {
      const review = await unwrap(
        apiClient.post<PolicyReview>(`/v1/policies/${policyId}/reviews`, input),
      );
      await mutate();
      return review;
    },
    [policyId, mutate],
  );

  return { reviews: data ?? [], error, isLoading, mutate, recordReview };
}

export function usePolicyAcknowledgements({ policyId }: { policyId: string }) {
  const { data, error, isLoading, mutate } = useSWR(policyAcknowledgementsKey(policyId), () =>
    unwrap(apiClient.get<PolicyAcknowledgements>(`/v1/policies/${policyId}/acknowledgements`)),
  );

  const sendReminder = useCallback(
    () =>
      unwrap(
        apiClient.post<PolicyReminderResult>(
          `/v1/policies/${policyId}/acknowledgements/remind`,
        ),
      ),
    [policyId],
  );

  return { acknowledgements: data ?? null, error, isLoading, mutate, sendReminder };
}

export function useMemberPolicyAcknowledgements({ memberId }: { memberId: string }) {
  // An empty memberId disables the request (e.g. viewer lacks policy:read).
  const key = memberId ? (['/v1/policy-acknowledgements', memberId] as const) : null;
  const { data, error, isLoading } = useSWR(key, async () => {
    const body = await unwrap(
      apiClient.get<{ data: PolicyAcknowledgementHistoryItem[] }>(
        `/v1/policy-acknowledgements?memberId=${encodeURIComponent(memberId)}`,
      ),
    );
    return Array.isArray(body.data) ? body.data : [];
  });
  return { history: data ?? [], error, isLoading };
}

export async function fetchPolicyDocumentControl(policyId: string) {
  return unwrap(apiClient.get<DocumentControl>(`/v1/policies/${policyId}/document-control`));
}

/** Downloads the acknowledgement CSV; filters are optional. */
export async function downloadAcknowledgementsCsv(filters: {
  policyId?: string;
  memberId?: string;
}) {
  const params = new URLSearchParams();
  if (filters.policyId) params.set('policyId', filters.policyId);
  if (filters.memberId) params.set('memberId', filters.memberId);
  const { csv, filename } = await unwrap(
    apiClient.get<{ csv: string; filename: string; count: number }>(
      `/v1/policy-acknowledgements/export?${params.toString()}`,
    ),
  );
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
