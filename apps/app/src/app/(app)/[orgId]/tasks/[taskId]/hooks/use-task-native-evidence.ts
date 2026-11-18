'use client';

import { apiClient } from '@/lib/api-client';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';

export type TaskNativeEvidence = {
  ruleKey: string;
  module: string;
  title: string;
  reference: string;
  /** App path below /{orgId}. */
  path: string;
  holds: boolean;
  summary: string;
  issues: string[];
  evaluatedAt: string;
  lastSubmittedAt: string | null;
  attachmentId: string | null;
  canSubmit: boolean;
};

type SubmitResponse = {
  outcome: 'submitted' | 'not_met' | 'not_open' | 'unchanged';
  attachmentId?: string;
};

export const taskNativeEvidenceKey = (taskId: string) =>
  ['/v1/tasks/native-evidence', taskId] as const;

/** Live status of the task's native-state rule (null when the task has none). */
export function useTaskNativeEvidence({ taskId }: { taskId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR(
    taskNativeEvidenceKey(taskId),
    async () => {
      const response = await apiClient.get<{ data: TaskNativeEvidence | null }>(
        `/v1/tasks/${taskId}/native-evidence`,
      );
      if (response.error) throw new Error(response.error);
      return response.data?.data ?? null;
    },
    { revalidateOnFocus: false },
  );

  const submit = async (): Promise<SubmitResponse> => {
    setIsSubmitting(true);
    try {
      const response = await apiClient.post<SubmitResponse>(
        `/v1/tasks/${taskId}/native-evidence/submit`,
        {},
      );
      if (response.error || !response.data) {
        throw new Error(response.error ?? 'Failed to send for review');
      }
      const attachmentsEndpoint = `/v1/tasks/${taskId}/attachments`;
      await Promise.all([
        mutate(),
        // The snapshot PDF lands in the task's attachment list.
        globalMutate((key) => Array.isArray(key) && key[0] === attachmentsEndpoint),
      ]);
      return response.data;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    evidence: data ?? null,
    isLoading: isLoading && data === undefined,
    error,
    isSubmitting,
    refresh: () => mutate(),
    submit,
  };
}
