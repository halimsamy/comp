'use client';

import type { AccessAccount, AccessFlag, AccessSystem } from '@/hooks/use-access-reviews';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api, type ApiResponse } from '@/lib/api-client';

export interface AccessRole {
  id: string;
  systemKey: string;
  systemName: string;
  name: string;
  permissionsScope: string | null;
  isPrivileged: boolean;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  lastReviewedAt: string | null;
}

export interface PrivilegedAccount {
  systemKey: string;
  systemName: string;
  accountId: string;
  name: string;
  email: string | null;
  ownerName: string | null;
  roles: string[];
  mfaEnabled: boolean | null;
  lastLoginAt: string | null;
  flags: AccessFlag[];
}

export type MemberAccessAccount = AccessAccount & { system: Pick<AccessSystem, 'key' | 'name' | 'kind' | 'logoUrl'> };

export type AccountTypeKey = 'human' | 'service' | 'shared';

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function useAccessRoles() {
  const swr = useApiSWR<{ data: AccessRole[] }>('/v1/access/roles');
  return { ...swr, roles: list<AccessRole>(swr.data?.data?.data) };
}

/** #83: one person's accounts across every system, from the access inventory. */
export function useMemberAccessAccounts(memberId: string | null) {
  const swr = useApiSWR<{ data: MemberAccessAccount[] }>(
    memberId ? `/v1/access/accounts?member=${encodeURIComponent(memberId)}` : null,
  );
  return { ...swr, accounts: list<MemberAccessAccount>(swr.data?.data?.data) };
}

const call = async <T>(request: Promise<ApiResponse<T>>, fallback: string): Promise<T> => {
  const response = await request;
  if (response.error || response.data === undefined) throw new Error(response.error ?? fallback);
  return response.data;
};

// Module-level, so the functions are stable across renders.
const accessRoleApi = {
    createRole: (body: {
      systemKey: string;
      systemName: string;
      name: string;
      permissionsScope?: string;
      isPrivileged?: boolean;
    }) => call(api.post<AccessRole>('/v1/access/roles', body), 'Failed to add the role'),
    updateRole: ({ id, ...body }: { id: string; name?: string; permissionsScope?: string | null; isPrivileged?: boolean }) =>
      call(api.patch<AccessRole>(`/v1/access/roles/${id}`, body), 'Failed to update the role'),
    deleteRole: (id: string) => call(api.delete(`/v1/access/roles/${id}`), 'Failed to delete the role'),
    setAllowedTypes: ({
      systemId,
      types,
    }: {
      systemId: string;
      types: { type: AccountTypeKey; allowed: boolean; justification?: string }[];
    }) => call(api.put(`/v1/access/systems/${systemId}/allowed-types`, { types }), 'Failed to save account types'),
    listPrivileged: async () => {
      const data = await call(
        api.get<{ data: PrivilegedAccount[] }>('/v1/access/privileged-accounts'),
        'Failed to load privileged accounts',
      );
      return list<PrivilegedAccount>(data.data);
    },
};

export function useAccessRoleMutations() {
  return accessRoleApi;
}
