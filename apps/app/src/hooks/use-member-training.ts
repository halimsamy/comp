'use client';

import { fileToBase64 } from '@/lib/file-utils';
import { useApiSWR } from '@/hooks/use-api-swr';
import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';

export interface TrainingCycle {
  moduleId: string;
  title: string;
  completedAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface MemberTrainingModule {
  id: string;
  title: string;
  description: string | null;
  contentUrl: string | null;
  frameworkReference: string | null;
  recurrenceMonths: number;
  status: 'completed' | 'expired' | 'not_started';
  completedAt: string | null;
  expiresAt: string | null;
}

function saveBlob({ blob, fileName }: { blob: Blob; fileName: string }) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/** A member's training cycles (with per-cycle certificates) and assigned custom modules. */
export function useMemberTraining(memberId: string) {
  const cyclesRes = useApiSWR<TrainingCycle[]>(`/v1/training/members/${memberId}/cycles`);
  const modulesRes = useApiSWR<MemberTrainingModule[]>(`/v1/training/members/${memberId}/modules`);
  const { mutate: mutateCycles } = cyclesRes;
  const { mutate: mutateModules } = modulesRes;

  const recordCompletion = useCallback(
    async ({ moduleId, completedAt }: { moduleId: string; completedAt?: string }) => {
      const res = await apiClient.post(
        `/v1/training/members/${memberId}/modules/${moduleId}/complete`,
        completedAt ? { completedAt } : {},
      );
      if (res.error) throw new Error(res.error);
      await Promise.all([mutateCycles(), mutateModules()]);
    },
    [memberId, mutateCycles, mutateModules],
  );

  /** #94: training taken outside the portal (classroom, other LMS), with an optional certificate. */
  const recordTraining = useCallback(
    async ({ module, completedAt, file }: { module: string; completedAt: string; file?: File }) => {
      const res = await apiClient.post(`/v1/training/members/${memberId}/records`, {
        module,
        completedAt,
        ...(file && { fileName: file.name, fileType: file.type || 'application/octet-stream', fileData: await fileToBase64(file) }),
      });
      if (res.error) throw new Error(res.error);
      await Promise.all([mutateCycles(), mutateModules()]);
    },
    [memberId, mutateCycles, mutateModules],
  );

  const downloadCertificate = useCallback(
    async (cycle: TrainingCycle) => {
      const res = await apiClient.raw(`/v1/training/members/${memberId}/cycles/certificate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId: cycle.moduleId, completedAt: cycle.completedAt }),
      });
      if (!res.ok) throw new Error('Failed to generate certificate');
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'training-certificate.pdf';
      saveBlob({ blob: await res.blob(), fileName });
    },
    [memberId],
  );

  return {
    cycles: Array.isArray(cyclesRes.data?.data) ? cyclesRes.data.data : [],
    modules: Array.isArray(modulesRes.data?.data) ? modulesRes.data.data : [],
    isLoading: cyclesRes.isLoading || modulesRes.isLoading,
    recordCompletion,
    recordTraining,
    downloadCertificate,
  };
}
