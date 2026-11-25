'use client';

import { useApi } from '@/hooks/use-api';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api as apiClient, type ApiResponse } from '@/lib/api-client';
import { fileToBase64 } from '@/lib/file-utils';

export type AccessFlag =
  | 'owner_departed'
  | 'unmapped'
  | 'admin'
  | 'no_mfa'
  | 'inactive'
  | 'no_activity'
  | 'role_not_approved'
  | 'admin_role_unapproved'
  | 'type_not_allowed';
export type AccessDecision = 'keep' | 'revoke' | 'modify';

export interface AccessSystem {
  key: string;
  name: string;
  kind: 'platform' | 'integration' | 'manual';
  logoUrl: string | null;
  description: string | null;
  lastSyncAt: string | null;
  accountCount: number;
  flaggedCount: number;
  /** Manual systems: which account types are allowed (#177). */
  allowedAccountTypes?: Partial<
    Record<'human' | 'service' | 'shared', { allowed: boolean; justification?: string | null }>
  >;
}

export interface AccessAccount {
  accountId: string;
  name: string;
  email: string | null;
  type: string | null;
  status: string;
  roles: string[];
  isAdmin: boolean;
  mfaEnabled: boolean | null;
  lastLoginAt: string | null;
  accountCreatedAt: string | null;
  owner: { memberId: string; name: string; email: string; departed: boolean } | null;
  ownerSource: 'email' | 'manual' | null;
  isServiceAccount: boolean;
  justification: string | null;
  flags: AccessFlag[];
}

export interface AccessReviewProgress {
  total: number;
  decided: number;
  kept: number;
  revoked: number;
  modified: number;
  flagged: number;
  pendingRemediation: number;
}

export interface AccessReviewSummary {
  id: string;
  name: string;
  status: 'in_progress' | 'completed';
  dueDate: string;
  createdAt: string;
  createdByName: string | null;
  signedOffByName: string | null;
  signedOffAt: string | null;
  taskId: string | null;
  systems: { systemName: string; reviewerName: string | null }[];
  progress: AccessReviewProgress;
}

export interface AccessReviewItem {
  id: string;
  reviewSystemId: string;
  accountId: string;
  accountName: string;
  email: string | null;
  ownerName: string | null;
  accountType: string | null;
  accountStatus: string | null;
  roles: string[];
  isAdmin: boolean;
  mfaEnabled: boolean | null;
  lastLoginAt: string | null;
  flags: AccessFlag[];
  decision: AccessDecision | null;
  comment: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  remediatedAt: string | null;
  remediationNote: string | null;
  remediationUrl?: string | null;
  ownerMemberId?: string | null;
  /** Marked done, but the inventory still shows the account active (#90). */
  revokedStillActive?: boolean;
  proofFiles?: { id: string; name: string }[];
}

export interface AccessReviewDetail extends Omit<AccessReviewSummary, 'systems'> {
  signOffNote: string | null;
  createdById?: string | null;
  systems: {
    id: string;
    systemKey: string;
    systemName: string;
    reviewerId?: string | null;
    reviewerName: string | null;
  }[];
  items: AccessReviewItem[];
}

export interface ImportedAccount {
  accountId: string;
  name?: string;
  email?: string;
  type?: 'human' | 'service' | 'shared';
  status?: 'active' | 'suspended' | 'deactivated';
  roles?: string[];
  isAdmin?: boolean;
  mfaEnabled?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  /** Owner email or name (#89). */
  owner?: string;
  /** Why a service or shared account exists. */
  justification?: string;
}

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function useAccessSystems() {
  const swr = useApiSWR<{ data: AccessSystem[] }>('/v1/access/systems');
  return { ...swr, systems: list<AccessSystem>(swr.data?.data?.data) };
}

export function useAccessAccounts(systemKey: string | null) {
  const swr = useApiSWR<{ data: AccessAccount[] }>(
    systemKey ? `/v1/access/accounts?system=${encodeURIComponent(systemKey)}` : null,
  );
  return { ...swr, accounts: list<AccessAccount>(swr.data?.data?.data) };
}

export function useAccessReviews() {
  const swr = useApiSWR<{ data: AccessReviewSummary[] }>('/v1/access-reviews');
  return { ...swr, reviews: list<AccessReviewSummary>(swr.data?.data?.data) };
}

export function useAccessReview(reviewId: string) {
  const swr = useApiSWR<AccessReviewDetail>(`/v1/access-reviews/${reviewId}`);
  const review = swr.data?.data;
  return { ...swr, review: review && Array.isArray(review.items) ? review : null };
}

export function useAccessMutations() {
  const api = useApi();

  const call = async <T>(request: Promise<ApiResponse<T>>, fallback: string): Promise<T> => {
    const response = await request;
    if (response.error || response.data === undefined) throw new Error(response.error ?? fallback);
    return response.data;
  };

  return {
    setOwner: (body: {
      systemKey: string;
      accountId: string;
      memberId?: string | null;
      isServiceAccount?: boolean;
      justification?: string;
    }) => call(api.put('/v1/access/owners', body), 'Failed to save the owner'),
    createSystem: (body: { name: string; description?: string }) =>
      call(
        api.post<{ id: string; key: string }>('/v1/access/systems', body),
        'Failed to add the system',
      ),
    deleteSystem: (id: string) =>
      call(api.delete(`/v1/access/systems/${id}`), 'Failed to delete the system'),
    importAccounts: ({ id, accounts }: { id: string; accounts: ImportedAccount[] }) =>
      call(
        api.post<{ imported: number; ownersMapped?: number }>(`/v1/access/systems/${id}/accounts`, {
          accounts,
        }),
        'Failed to import accounts',
      ),
    addAccount: ({ id, account }: { id: string; account: ImportedAccount }) =>
      call(
        api.post<{ accountId: string }>(`/v1/access/systems/${id}/accounts/add`, account),
        'Failed to add the account',
      ),
    removeAccount: ({ id, accountId }: { id: string; accountId: string }) =>
      call(
        api.delete(`/v1/access/systems/${id}/accounts/${encodeURIComponent(accountId)}`),
        'Failed to remove the account',
      ),
    createReview: (body: {
      name: string;
      dueDate: string;
      systems: { systemKey: string; reviewerMemberId?: string }[];
    }) => call(api.post<{ id: string }>('/v1/access-reviews', body), 'Failed to start the review'),
    decide: ({
      reviewId,
      ...body
    }: {
      reviewId: string;
      itemIds: string[];
      decision: AccessDecision;
      comment?: string;
    }) =>
      call(
        api.post<{ updated: number; skipped: number }>(`/v1/access-reviews/${reviewId}/decisions`, body),
        'Failed to save the decision',
      ),
    remediate: async ({
      reviewId,
      itemId,
      note,
      url,
      file,
    }: {
      reviewId: string;
      itemId: string;
      note?: string;
      url?: string;
      file?: File;
    }) => {
      const proof = file
        ? { fileName: file.name, fileType: file.type || 'application/octet-stream', fileData: await fileToBase64(file) }
        : {};
      return call(
        api.post(`/v1/access-reviews/${reviewId}/items/${itemId}/remediation`, {
          note,
          ...(url && { url }),
          ...proof,
        }),
        'Failed to mark the change as done',
      );
    },
    signOff: ({ reviewId, note }: { reviewId: string; note?: string }) =>
      call(api.post(`/v1/access-reviews/${reviewId}/sign-off`, { note }), 'Failed to sign off'),
    deleteReview: (reviewId: string) =>
      call(api.delete(`/v1/access-reviews/${reviewId}`), 'Failed to delete the review'),
    downloadReport: async ({ reviewId, name }: { reviewId: string; name: string }) => {
      const response = await apiClient.raw(`/v1/access-reviews/${reviewId}/report`);
      if (!response.ok) throw new Error('Failed to generate the report');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `access-review-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    },
  };
}
