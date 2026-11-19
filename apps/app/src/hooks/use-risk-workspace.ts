'use client';

import { useApi } from '@/hooks/use-api';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { RiskLevel } from '@/lib/risk-score';
import type { Impact, Likelihood, RiskCategory, RiskStatus } from '@db';
import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import type { TaskItemPriority, TaskItemStatus } from './use-task-items';

export interface RiskLibraryTemplate {
  id: string;
  group: string;
  title: string;
  description: string;
  category: RiskCategory;
  likelihood: Likelihood;
  impact: Impact;
  treatment: string;
  references: string[];
  added: boolean;
  /** Controls in the org's frameworks matching `references`; linked on add. */
  recommendedControls?: number;
}

export interface RiskDraft {
  title: string;
  description: string;
  category: RiskCategory;
  likelihood: Likelihood;
  impact: Impact;
  treatmentStrategyDescription?: string;
  /** Framework references (e.g. "PCI DSS 8.4.2") whose controls are linked. */
  references?: string[];
}

export interface RiskSuggestion extends RiskDraft {
  treatmentStrategyDescription: string;
  source: string;
}

export interface RiskTreatmentAction {
  id: string;
  title: string;
  description: string | null;
  status: TaskItemStatus;
  priority: TaskItemPriority;
  dueDate: string | null;
  completedAt: string | null;
  entityId: string;
  createdAt: string;
  isOverdue: boolean;
  risk: { id: string; title: string; status: RiskStatus } | null;
  assignee: {
    id: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  } | null;
}

export interface RiskMethodologySettings {
  acceptanceRequiredFromLevel: RiskLevel;
  reviewIntervalMonths: number;
  /** Five entries, lowest (very unlikely / insignificant) first. */
  likelihoodDescriptions?: string[];
  impactDescriptions?: string[];
}

/** An evidence task linked to a risk: the controls side of the treatment plan. */
export interface RiskLinkedTaskRow {
  risk: { id: string; ref: string | null; title: string };
  task: {
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    assignee: { id: string; user: { name: string | null; email: string } } | null;
    controls: { id: string; name: string }[];
  };
}

export interface RiskReviewTotals {
  risks: number;
  byInherentLevel: Record<RiskLevel, number>;
  byResidualLevel: Record<RiskLevel, number>;
  withoutOwner: number;
  awaitingAcceptance: number;
  staleAcceptance: number;
  openActions: number;
  overdueActions: number;
}

export type RiskReviewTrigger = 'scheduled' | 'significant_change';

export interface RiskReviewSummary {
  id: string;
  reviewedByName: string;
  trigger: RiskReviewTrigger;
  notes: string | null;
  nextReviewDue: string;
  createdAt: string;
  totals: RiskReviewTotals | null;
}

export interface RiskReviewDetail extends Omit<RiskReviewSummary, 'totals'> {
  snapshot: {
    acceptanceRequiredFromLevel: RiskLevel;
    totals: RiskReviewTotals;
    risks: Array<{
      id: string;
      title: string;
      category: string;
      status: string;
      inherentLevel: RiskLevel;
      residualLevel: RiskLevel;
      treatmentStrategy: string;
      ownerName: string | null;
      acceptance: 'accepted' | 'awaiting' | 'stale' | 'not_required';
      openActions: number;
      overdueActions: number;
    }>;
  };
}

export interface RiskReviewsResponse {
  data: RiskReviewSummary[];
  settings: RiskMethodologySettings;
  status: { lastReviewedAt: string | null; nextReviewDue: string | null; isOverdue: boolean };
}

const BASE = '/v1/risk-management';

const LEVEL_ORDER: RiskLevel[] = ['very-low', 'low', 'medium', 'high', 'very-high'];

/** Same rule as the API (risk-methodology-settings.ts): acceptance from the threshold level up. */
export function isAcceptanceRequired({
  level,
  threshold,
}: {
  level: RiskLevel;
  threshold: RiskLevel;
}): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(threshold);
}

/** Revalidate every cached risk list (register, heatmaps) after adding risks. */
export function useRefreshRiskLists() {
  const { mutate } = useSWRConfig();
  return useCallback(
    () =>
      mutate(
        (key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/v1/risks'),
      ),
    [mutate],
  );
}

export function useRiskLibrary() {
  const swr = useApiSWR<{ data: RiskLibraryTemplate[] }>(`${BASE}/library`);
  const data = swr.data?.data?.data;
  return { ...swr, templates: Array.isArray(data) ? data : [] };
}

export function useRiskSettings() {
  const swr = useApiSWR<RiskMethodologySettings>(`${BASE}/settings`);
  return { ...swr, settings: swr.data?.data ?? null };
}

export function useRiskTreatmentActions() {
  const swr = useApiSWR<{ data: RiskTreatmentAction[] }>(`${BASE}/actions`);
  const data = swr.data?.data?.data;
  return { ...swr, actions: Array.isArray(data) ? data : [] };
}

export function useRiskLinkedTasks() {
  const swr = useApiSWR<{ data: RiskLinkedTaskRow[] }>(`${BASE}/linked-tasks`);
  const data = swr.data?.data?.data;
  return { ...swr, rows: Array.isArray(data) ? data : [] };
}

export function useRiskReviews() {
  const swr = useApiSWR<RiskReviewsResponse>(`${BASE}/reviews`);
  const body = swr.data?.data;
  return {
    ...swr,
    reviews: Array.isArray(body?.data) ? body.data : [],
    settings: body?.settings ?? null,
    status: body?.status ?? null,
  };
}

export function useRiskReview(reviewId: string | null) {
  const swr = useApiSWR<RiskReviewDetail>(reviewId ? `${BASE}/reviews/${reviewId}` : null);
  return { ...swr, review: swr.data?.data ?? null };
}

export function useRiskWorkspaceMutations() {
  const api = useApi();

  const addRisks = useCallback(
    async (risks: RiskDraft[]) => {
      const response = await api.post<{
        created: { id: string; title: string; ref: string | null; linkedTasks: number }[];
        skipped: string[];
      }>(
        `${BASE}/risks/bulk`,
        { risks },
      );
      if (response.error || !response.data) throw new Error(response.error ?? 'Failed to add risks');
      return response.data;
    },
    [api],
  );

  const suggestRisks = useCallback(async () => {
    const response = await api.post<{ data: RiskSuggestion[] }>(`${BASE}/suggestions`, {});
    if (response.error || !response.data) {
      throw new Error(response.error ?? 'Failed to generate suggestions');
    }
    return Array.isArray(response.data.data) ? response.data.data : [];
  }, [api]);

  const recordReview = useCallback(
    async (input: { notes?: string; reviewedById?: string; trigger?: RiskReviewTrigger }) => {
      const response = await api.post<RiskReviewSummary>(`${BASE}/reviews`, input);
      if (response.error || !response.data) throw new Error(response.error ?? 'Failed to record review');
      return response.data;
    },
    [api],
  );

  return { addRisks, suggestRisks, recordReview };
}
