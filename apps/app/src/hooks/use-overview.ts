'use client';

import { useApiSWR } from '@/hooks/use-api-swr';

export type AttentionModule =
  | 'tasks'
  | 'policies'
  | 'acknowledgements'
  | 'training'
  | 'people'
  | 'vendors'
  | 'risks'
  | 'assets'
  | 'vulnerabilities'
  | 'checks'
  | 'correctiveActions'
  | 'documents'
  | 'questionnaires'
  | 'accessReviews';

export interface AttentionCard {
  module: AttentionModule;
  label: string;
  needsAttention: number;
  ok: number;
  total: number;
  /** Org-relative path, e.g. `/tasks`. */
  href: string;
  /** A reason may deep-link to the filtered list (org-relative). */
  reasons: Array<{ label: string; count: number; href?: string }>;
}

export type DeadlineType =
  | 'task'
  | 'policy_review'
  | 'vendor_review'
  | 'vendor_document'
  | 'training'
  | 'access_review'
  | 'policy_approval'
  | 'timeline_phase'
  | 'audit_request'
  | 'questionnaire_review'
  | 'vulnerability'
  | 'corrective_action'
  | 'review_action'
  | 'risk_review'
  | 'risk_action'
  | 'scan'
  | 'form';

export interface DeadlineItem {
  id: string;
  type: DeadlineType;
  title: string;
  subtitle: string | null;
  /** null only in `noDueDate`. */
  dueDate: string | null;
  href: string;
  ownerName: string | null;
}

export interface Deadlines {
  windowDays: number;
  overdueCount: number;
  dueSoonCount: number;
  noDueDateCount: number;
  overdue: DeadlineItem[];
  dueSoon: DeadlineItem[];
  /** Open work nobody put a date on. */
  noDueDate: DeadlineItem[];
}

export interface FrameworkTrend {
  frameworkInstanceId: string;
  frameworkName: string;
  points: Array<{
    date: string;
    scorePercent: number;
    controlsComplete: number;
    controlsTotal: number;
  }>;
}

export interface IntegrationCoverage {
  providerSlug: string;
  tasks: number;
  openTasks: number;
  frameworks: Array<{ name: string; requirements: number }>;
}

/** Needs-attention cards for the overview (GET /v1/overview/attention). */
export function useOverviewAttention({ enabled = true }: { enabled?: boolean } = {}) {
  const swr = useApiSWR<{ data: AttentionCard[] }>('/v1/overview/attention', {
    enabled,
    revalidateOnFocus: true,
  });
  const cards = swr.data?.data?.data;
  return {
    ...swr,
    cards: Array.isArray(cards) ? cards : null,
    hasError: Boolean(swr.error || swr.data?.error),
  };
}

/** Overdue / due-soon queue across modules (GET /v1/overview/deadlines). */
export function useOverviewDeadlines({
  days = 30,
  enabled = true,
}: { days?: number; enabled?: boolean } = {}) {
  const swr = useApiSWR<Deadlines>(`/v1/overview/deadlines?days=${days}`, { enabled });
  const body = swr.data?.data;
  const deadlines =
    body && Array.isArray(body.overdue) && Array.isArray(body.dueSoon)
      ? { ...body, noDueDate: Array.isArray(body.noDueDate) ? body.noDueDate : [] }
      : null;
  return { ...swr, deadlines, hasError: Boolean(swr.error || swr.data?.error) };
}

/** Daily framework score history (GET /v1/overview/trends). */
export function useComplianceTrends({
  days = 90,
  enabled = true,
}: { days?: number; enabled?: boolean } = {}) {
  const swr = useApiSWR<{ days: number; frameworks: FrameworkTrend[] }>(
    `/v1/overview/trends?days=${days}`,
    {
      enabled,
    },
  );
  const frameworks = swr.data?.data?.frameworks;
  return {
    ...swr,
    frameworks: Array.isArray(frameworks) ? frameworks : null,
    hasError: Boolean(swr.error || swr.data?.error),
  };
}

/** Per-integration task and requirement coverage (GET /v1/overview/integration-coverage). */
export function useIntegrationCoverage({ enabled = true }: { enabled?: boolean } = {}) {
  const swr = useApiSWR<{ data: IntegrationCoverage[] }>('/v1/overview/integration-coverage', {
    enabled,
  });
  const rows = swr.data?.data?.data;
  const coverage = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.providerSlug, row]));
  return { ...swr, coverage };
}
