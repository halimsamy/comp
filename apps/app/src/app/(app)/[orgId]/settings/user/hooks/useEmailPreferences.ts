'use client';

import { apiClient } from '@/lib/api-client';
import useSWR from 'swr';

export type DigestFrequency = 'daily' | 'weekly';

interface EmailPreferences {
  policyNotifications: boolean;
  taskReminders: boolean;
  weeklyTaskDigest: boolean;
  unassignedItemsNotifications: boolean;
  taskMentions: boolean;
  taskAssignments: boolean;
  complianceDigest?: boolean;
  ownershipAssignments?: boolean;
  slaAlerts?: boolean;
  digestFrequency?: DigestFrequency;
  complianceDigestFrequency?: DigestFrequency;
}

export const emailPreferencesKey = () => ['/v1/people/me/email-preferences'] as const;

interface UseEmailPreferencesOptions {
  initialPreferences?: EmailPreferences;
}

export function useEmailPreferences(options?: UseEmailPreferencesOptions) {
  const { initialPreferences } = options ?? {};

  const { data, error, isLoading, mutate } = useSWR(
    emailPreferencesKey(),
    async () => {
      const response = await apiClient.get<{
        preferences: EmailPreferences;
      }>('/v1/people/me/email-preferences');
      if (response.error) throw new Error(response.error);
      return response.data?.preferences ?? null;
    },
    {
      fallbackData: initialPreferences,
      revalidateOnMount: !initialPreferences,
      revalidateOnFocus: false,
    },
  );

  const savePreferences = async (preferences: EmailPreferences) => {
    // Optimistic update
    await mutate(preferences, false);

    try {
      // PATCH merges, so keys this form doesn't know about are kept.
      const response = await apiClient.patch('/v1/people/me/email-preferences', {
        preferences,
      });
      if (response.error) throw new Error(response.error);
      await mutate();
    } catch (err) {
      // Rollback
      await mutate(initialPreferences, false);
      throw err;
    }
  };

  return {
    preferences: data ?? initialPreferences ?? null,
    isLoading: isLoading && !data,
    error,
    mutate,
    savePreferences,
  };
}
