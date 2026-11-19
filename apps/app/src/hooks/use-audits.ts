'use client';

import { apiClient } from '@/lib/api-client';
import useSWR, { mutate as globalMutate } from 'swr';

export type AuditStatus = 'planned' | 'in_progress' | 'awaiting_report' | 'completed';
export type AuditReviewStatus = 'accepted' | 'flagged' | 'requested';
export type AuditReadiness = 'ready' | 'needs_update' | 'not_ready' | 'not_applicable';
export type AuditRequestStatus = 'open' | 'submitted' | 'accepted';

export interface AuditProgress {
  total: number;
  accepted: number;
  flagged: number;
  requested: number;
  notReviewed: number;
}

export interface Audit {
  id: string;
  title: string;
  firmName: string | null;
  status: AuditStatus;
  periodStart: string;
  periodEnd: string;
  accessEndsAt: string | null;
  /** Invited auditors who have not joined yet; assigned on their first visit. */
  pendingAuditorEmails: string[];
  createdAt: string;
  frameworkInstanceId: string;
  frameworkName: string;
  auditors: Array<{ memberId: string; name: string | null; email: string; image: string | null }>;
  progress: AuditProgress;
  openRequests: number;
  viewerIsAuditor: boolean;
}

export interface AuditPayload {
  frameworkInstanceId?: string;
  title?: string;
  firmName?: string | null;
  status?: AuditStatus;
  periodStart?: string;
  periodEnd?: string;
  accessEndsAt?: string | null;
  auditorMemberIds?: string[];
  pendingAuditorEmails?: string[];
}

export interface AuditRequirement {
  id: string;
  identifier: string;
  name: string;
  description: string;
  controls: string[];
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    filesInPeriod: number;
    needsUpdate: boolean;
  }>;
  policies: Array<{ id: string; name: string; status: string }>;
  documents: Array<{ formType: string; slug: string | null; title: string; submissionsInPeriod: number }>;
  readiness: AuditReadiness;
  /** What keeps the requirement from ready (unfinished tasks, drafts, missing forms). */
  blockedBy: string[];
  review: {
    status: AuditReviewStatus;
    note: string | null;
    reviewedAt: string;
    reviewedBy: { name: string | null; email: string } | null;
  } | null;
  commentCount: number;
  openRequestCount: number;
}

export interface AuditComment {
  id: string;
  requirementId: string | null;
  content: string;
  createdAt: string;
  author: { name: string | null; email: string } | null;
}

export interface AuditRequest {
  id: string;
  requirementId: string | null;
  title: string;
  description: string | null;
  status: AuditRequestStatus;
  dueDate: string | null;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  requestedBy: { name: string | null; email: string } | null;
  /** auditor = raised in the workspace; team = logged from the auditor's request list. */
  source: 'auditor' | 'team';
  ownerMemberId: string | null;
  attachments: Array<{ id: string; name: string; createdAt: string }>;
}

export interface TeamAuditRequestPayload {
  title: string;
  description?: string;
  requirementId?: string;
  dueDate?: string;
  ownerMemberId?: string;
}

export const auditsKey = '/v1/audits';

async function unwrap<T>(promise: Promise<{ data?: T; error?: string }>): Promise<T | undefined> {
  const res = await promise;
  if (res.error) throw new Error(res.error);
  return res.data;
}

const swrOptions = { revalidateOnFocus: false };

async function fetchList<T>(key: string): Promise<T[]> {
  const res = await unwrap(apiClient.get<{ data: T[] }>(key));
  return Array.isArray(res?.data) ? res.data : [];
}

/** Audit engagements with create / update / delete. */
export function useAudits({ initialData }: { initialData?: Audit[] } = {}) {
  const { data, error, isLoading, mutate } = useSWR(auditsKey, fetchList<Audit>, {
    ...swrOptions,
    fallbackData: initialData,
    revalidateOnMount: !initialData,
  });

  const create = async (payload: AuditPayload) => {
    await unwrap(apiClient.post(auditsKey, payload));
    await mutate();
  };
  const update = async ({ id, payload }: { id: string; payload: AuditPayload }) => {
    await unwrap(apiClient.patch(`${auditsKey}/${id}`, payload));
    await mutate();
  };
  const remove = async (id: string) => {
    await unwrap(apiClient.delete(`${auditsKey}/${id}`));
    await mutate();
  };

  return {
    audits: Array.isArray(data) ? data : [],
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    create,
    update,
    remove,
  };
}

export function useAudit({ auditId, initialData }: { auditId: string; initialData?: Audit }) {
  const { data, error, mutate } = useSWR(
    `${auditsKey}/${auditId}`,
    (key: string) => unwrap(apiClient.get<Audit>(key)),
    { ...swrOptions, fallbackData: initialData, revalidateOnMount: !initialData },
  );
  return { audit: data, error: error as Error | undefined, mutate };
}

/** The workspace rows plus the auditor's assessment actions. */
export function useAuditRequirements(auditId: string) {
  const key = `${auditsKey}/${auditId}/requirements`;
  const { data, error, isLoading, mutate } = useSWR(key, fetchList<AuditRequirement>, swrOptions);

  const review = async ({
    requirementId,
    status,
    note,
  }: {
    requirementId: string;
    status: AuditReviewStatus | null;
    note?: string;
  }) => {
    const path = `${key}/${requirementId}/review`;
    await unwrap(status ? apiClient.put(path, { status, note }) : apiClient.delete(path));
    await mutate();
  };

  return {
    requirements: Array.isArray(data) ? data : [],
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    review,
    mutate,
  };
}

export function useAuditComments({
  auditId,
  requirementId,
}: {
  auditId: string;
  requirementId: string | null;
}) {
  const key = requirementId
    ? `${auditsKey}/${auditId}/comments?requirementId=${encodeURIComponent(requirementId)}`
    : null;
  const { data, error, isLoading, mutate } = useSWR(key, fetchList<AuditComment>, swrOptions);

  const add = async (content: string) => {
    await unwrap(apiClient.post(`${auditsKey}/${auditId}/comments`, { requirementId, content }));
    // The workspace table shows each requirement's comment count.
    await Promise.all([mutate(), globalMutate(`${auditsKey}/${auditId}/requirements`)]);
  };

  return {
    comments: Array.isArray(data) ? data : [],
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    add,
  };
}

export function useAuditRequests(auditId: string) {
  const key = `${auditsKey}/${auditId}/requests`;
  const { data, error, isLoading, mutate } = useSWR(key, fetchList<AuditRequest>, swrOptions);

  const create = async (payload: {
    title: string;
    description?: string;
    requirementId?: string;
    dueDate?: string;
  }) => {
    await unwrap(apiClient.post(key, payload));
    await mutate();
  };
  /** Log requests from the auditor's request list: one ("Add request") or a CSV import. */
  const createTeam = async (requests: TeamAuditRequestPayload[]) => {
    const res = await unwrap(apiClient.post<{ count: number }>(`${key}/team`, { requests }));
    await mutate();
    return res?.count ?? 0;
  };
  const respond = async ({ id, response }: { id: string; response: string }) => {
    await unwrap(apiClient.patch(`${key}/${id}/response`, { response }));
    await mutate();
  };
  const decide = async ({ id, status }: { id: string; status: 'accepted' | 'open' }) => {
    await unwrap(apiClient.patch(`${key}/${id}/status`, { status }));
    await mutate();
  };
  const upload = async ({
    id,
    file,
  }: {
    id: string;
    file: { fileName: string; fileType: string; fileData: string };
  }) => {
    await unwrap(apiClient.post(`${key}/${id}/attachments`, file));
    await mutate();
  };

  return {
    requests: Array.isArray(data) ? data : [],
    isLoading: isLoading && !data,
    error: error as Error | undefined,
    create,
    createTeam,
    respond,
    decide,
    upload,
  };
}
