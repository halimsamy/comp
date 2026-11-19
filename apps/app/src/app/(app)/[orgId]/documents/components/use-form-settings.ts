'use client';

import { apiClient } from '@/lib/api-client';
import useSWR, { useSWRConfig } from 'swr';

export type FormDeadlineStatus = 'ok' | 'due_soon' | 'overdue' | 'never_submitted' | 'not_relevant';

/** One form's row of GET /v1/evidence-forms/statuses (owner, cadence, deadline). */
export type FormStatus = {
  lastSubmittedAt: string | null;
  isNotRelevant?: boolean;
  cadenceMonths?: number;
  cadenceMonthsOverride?: number | null;
  nextDueAt?: string | null;
  isFresh?: boolean;
  status?: FormDeadlineStatus;
  ownerMemberId?: string | null;
  frameworks?: string[];
};
export type FormStatuses = Record<string, FormStatus>;

export const formStatusesKey = (organizationId: string) =>
  ['/v1/evidence-forms/statuses', organizationId] as const;

/** Owner, cadence and deadline of every company form (#50, #136). */
export function useFormStatuses(organizationId: string) {
  const { mutate: globalMutate } = useSWRConfig();
  const key = formStatusesKey(organizationId);
  const { data, error, isLoading } = useSWR<FormStatuses>(key, async ([endpoint, orgId]: readonly [string, string]) => {
    const response = await apiClient.get<FormStatuses>(endpoint, orgId);
    if (response.error || !response.data) throw new Error(response.error ?? 'Failed to load form statuses');
    return response.data;
  });

  const refresh = () => globalMutate(key);

  const updateSetting = async ({
    formType,
    ownerMemberId,
    cadenceMonthsOverride,
  }: {
    formType: string;
    ownerMemberId?: string | null;
    cadenceMonthsOverride?: number | null;
  }) => {
    const response = await apiClient.patch(`/v1/evidence-forms/${formType}/settings`, {
      ownerMemberId,
      cadenceMonthsOverride,
    });
    if (response.error) throw new Error(response.error);
    await refresh();
  };

  const bulkSetOwner = async ({ formTypes, ownerMemberId }: { formTypes: string[]; ownerMemberId: string | null }) => {
    const response = await apiClient.patch<{ updatedCount: number }>('/v1/evidence-forms/settings/bulk-owner', {
      formTypes,
      ownerMemberId,
    });
    if (response.error) throw new Error(response.error);
    await refresh();
    return response.data?.updatedCount ?? formTypes.length;
  };

  return { statuses: data, error, isLoading: isLoading && !data, updateSetting, bulkSetOwner };
}
