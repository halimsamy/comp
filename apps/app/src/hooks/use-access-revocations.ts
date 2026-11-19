'use client';

import { useApi } from '@/hooks/use-api';
import { useApiSWR } from '@/hooks/use-api-swr';
import { fileToBase64 } from '@/lib/file-utils';
import { useCallback } from 'react';

interface RevokedBy {
  id: string;
  name: string;
  email: string;
}

interface EvidenceFile {
  id: string;
  name: string;
  type: string;
  downloadUrl: string;
  createdAt: string;
}

/** One system to remove the leaver from: an access-inventory system, or a vendor fallback. */
export interface RevocationSystem {
  systemKey: string;
  name: string;
  kind: 'inventory' | 'vendor';
  logoUrl: string | null;
  vendorId: string | null;
  /** Vendor fallbacks don't hold the checklist item open. */
  optional: boolean;
  accounts: { accountId: string; name: string; status: string; roles: string[] }[];
  activeAccounts: number;
  revoked: boolean;
  /** Marked revoked, but the inventory still shows an active account. */
  stillActive: boolean;
  revokedAt: string | null;
  revokedBy: RevokedBy | null;
  notes: string | null;
  evidence: EvidenceFile[];
}

interface AccessRevocationsResponse {
  systems: RevocationSystem[];
  vendors?: RevocationSystem[];
  totalSystems: number;
  revokedCount: number;
  stillActiveCount: number;
}

export function useAccessRevocations(memberId: string) {
  const api = useApi();
  const endpoint = `/v1/offboarding-checklist/member/${memberId}/access-revocations`;

  const { data, error, isLoading, mutate } = useApiSWR<AccessRevocationsResponse>(endpoint);
  const revocations = data?.data ?? null;

  const revokeAccess = useCallback(
    async (systemKey: string, opts?: { notes?: string; file?: File }) => {
      let body: Record<string, unknown> = {};
      if (opts?.notes) body.notes = opts.notes;
      if (opts?.file) {
        const base64 = await fileToBase64(opts.file);
        body = { ...body, fileName: opts.file.name, fileType: opts.file.type || 'application/octet-stream', fileData: base64 };
      }
      const response = await api.post(`${endpoint}/${encodeURIComponent(systemKey)}`, body);
      if (response.error) throw new Error(response.error);
      await mutate();
    },
    [api, endpoint, mutate],
  );

  const undoRevocation = useCallback(
    async (systemKey: string) => {
      const response = await api.delete(`${endpoint}/${encodeURIComponent(systemKey)}`);
      if (response.error) throw new Error(response.error);
      await mutate();
    },
    [api, endpoint, mutate],
  );

  const revokeAll = useCallback(
    async () => {
      const response = await api.post(`${endpoint}/confirm-all`);
      if (response.error) throw new Error(response.error);
      await mutate();
    },
    [api, endpoint, mutate],
  );

  return {
    revocations,
    isLoading,
    error,
    revokeAccess,
    undoRevocation,
    revokeAll,
  };
}
