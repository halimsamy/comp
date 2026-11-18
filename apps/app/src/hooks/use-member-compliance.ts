'use client';

import { useApiSWR } from '@/hooks/use-api-swr';

export type ComplianceStatus =
  | 'complete'
  | 'in_progress'
  | 'incomplete'
  | 'overdue'
  | 'expired'
  | 'not_required';

export interface ComplianceItem {
  key: string;
  title: string;
  status: ComplianceStatus;
  detail: string;
  completedAt: string | null;
  dueDate: string | null;
  expiresAt: string | null;
}

export interface MemberCompliance {
  member: {
    id: string;
    name: string | null;
    email: string;
    joinedAt: string;
    onboardDate: string | null;
    offboardDate: string | null;
    deactivated: boolean;
  };
  items: ComplianceItem[];
  completedItems: number;
  totalItems: number;
}

/** Per-person people-security checklist (policies, training, device, background check, on/offboarding). */
export function useMemberCompliance(memberId: string) {
  const { data, error, isLoading, mutate } = useApiSWR<MemberCompliance>(
    `/v1/people-lifecycle/members/${memberId}/compliance`,
    { revalidateOnMount: true },
  );
  return { compliance: data?.data ?? null, error, isLoading, refresh: mutate };
}
