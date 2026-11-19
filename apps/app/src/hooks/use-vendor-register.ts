'use client';

import { useApi } from '@/hooks/use-api';
import type { UpdateVendorTpspData } from '@/hooks/use-vendors';
import { useCallback } from 'react';
import { useSWRConfig } from 'swr';

export interface BulkVendorUpdate extends UpdateVendorTpspData {
  id: string;
  assigneeId?: string | null;
}

/** Revalidates every cached /v1/vendors key (list, archived list, detail). */
function useRefreshVendors() {
  const { mutate } = useSWRConfig();
  return useCallback(
    () =>
      mutate(
        (key) =>
          (typeof key === 'string' && key.includes('/v1/vendors')) ||
          (Array.isArray(key) && String(key[0]).includes('/v1/vendors')),
        undefined,
        { revalidate: true },
      ),
    [mutate],
  );
}

/** Bulk classification / CSV import and archiving (vendor:update). */
export function useVendorRegisterActions() {
  const api = useApi();
  const refresh = useRefreshVendors();

  const run = useCallback(
    async <T>(request: Promise<{ data?: T; error?: string }>) => {
      const response = await request;
      if (response.error) throw new Error(response.error);
      await refresh();
      return response.data;
    },
    [refresh],
  );

  const bulkUpdateVendors = useCallback(
    (updates: BulkVendorUpdate[]) =>
      run(api.post<{ updated: number }>('/v1/vendors/bulk-update', { updates })),
    [api, run],
  );

  const archiveVendor = useCallback(
    (vendorId: string, reason?: string) =>
      run(api.post(`/v1/vendors/${vendorId}/archive`, { reason: reason || undefined })),
    [api, run],
  );

  const unarchiveVendor = useCallback(
    (vendorId: string) => run(api.post(`/v1/vendors/${vendorId}/unarchive`, {})),
    [api, run],
  );

  return { bulkUpdateVendors, archiveVendor, unarchiveVendor };
}
