'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import { apiClient, type ApiResponse } from '@/lib/api-client';
import { useCallback } from 'react';

export type ChecklistItemStatus = 'todo' | 'done' | 'locked' | 'skipped';

export interface ChecklistSkip {
  reason: string;
  skippedAt: string;
  skippedById: string | null;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: ChecklistItemStatus;
  /** Org-relative path, e.g. `/policies`. */
  href: string;
  ctaLabel: string;
  references: string[];
  dependsOn: string[];
  lockedReason: string | null;
  progress: { done: number; total: number } | null;
  skip: ChecklistSkip | null;
  /** False for steps an audit cannot do without (SoA, ISMS documents, PCI scope). */
  skippable: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  description: string;
  items: ChecklistItem[];
  completed: number;
  total: number;
}

export interface OnboardingChecklist {
  sections: ChecklistSection[];
  completed: number;
  total: number;
  percent: number;
  isComplete: boolean;
}

const ENDPOINT = '/v1/onboarding/checklist';

/** Getting Started guide, computed by the API from live org state. Shared by the page and the sidebar footer. */
export function useOnboardingChecklist({ enabled = true }: { enabled?: boolean } = {}) {
  const swr = useApiSWR<OnboardingChecklist>(ENDPOINT, { enabled, revalidateOnFocus: true });
  const { mutate } = swr;
  const body = swr.data?.data;
  const checklist = body && Array.isArray(body.sections) ? body : null;

  const applyResult = useCallback(
    async (request: Promise<ApiResponse<OnboardingChecklist>>) => {
      const result = await request;
      if (result.error || !result.data) throw new Error(result.error ?? 'Request failed');
      await mutate({ data: result.data, status: result.status }, { revalidate: false });
      return result.data;
    },
    [mutate],
  );

  const skipItem = useCallback(
    ({ itemId, reason }: { itemId: string; reason: string }) =>
      applyResult(
        apiClient.put<OnboardingChecklist>(`${ENDPOINT}/items/${itemId}/skip`, { reason }),
      ),
    [applyResult],
  );

  const unskipItem = useCallback(
    (itemId: string) =>
      applyResult(apiClient.delete<OnboardingChecklist>(`${ENDPOINT}/items/${itemId}/skip`)),
    [applyResult],
  );

  return { ...swr, checklist, skipItem, unskipItem };
}
