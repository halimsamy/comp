'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import { apiClient } from '@/lib/api-client';
import { useCallback } from 'react';

export interface SecuritySettings {
  sessionIdleTimeoutMinutes: number | null;
  allowedSignInMethods: string[];
  idleTimeoutOptions: number[];
  availableSignInMethods: { id: string; label: string }[];
}

export type SecuritySettingsUpdate = Partial<
  Pick<SecuritySettings, 'sessionIdleTimeoutMinutes' | 'allowedSignInMethods'>
>;

const SETTINGS_ENDPOINT = '/v1/security-settings';

/** Org security settings: idle session timeout and allowed sign-in methods. */
export function useSecuritySettings() {
  const { data, error, isLoading, mutate } = useApiSWR<SecuritySettings>(SETTINGS_ENDPOINT);

  const update = useCallback(
    async (patch: SecuritySettingsUpdate) => {
      const res = await apiClient.patch<SecuritySettings>(SETTINGS_ENDPOINT, patch);
      if (res.error) throw new Error(res.error);
      await mutate();
      return res.data;
    },
    [mutate],
  );

  return {
    settings: data?.data ?? null,
    error: error ?? (data?.error ? new Error(data.error) : undefined),
    isLoading,
    update,
  };
}

/** The idle timeout every app user needs (app:read), for the client idle timer. */
export function useSessionPolicy() {
  const { data } = useApiSWR<{ sessionIdleTimeoutMinutes: number | null }>(
    `${SETTINGS_ENDPOINT}/session-policy`,
    { errorRetryCount: 0 },
  );
  return { idleTimeoutMinutes: data?.data?.sessionIdleTimeoutMinutes ?? null };
}
