'use client';

import { api } from '@/lib/api-client';
import useSWR from 'swr';
import type { IsmsAuditFindingStatus } from '../isms-types';

export type NonconformitySource =
  'incident' | 'external_audit' | 'management_review' | 'monitoring' | 'complaint' | 'other';

/**
 * One 10.2 register row: a standalone nonconformity, an internal-audit NC
 * finding, or an external audit finding (Audits → Findings, read-only here).
 */
export interface IsmsNonconformityRow {
  id: string;
  kind: 'standalone' | 'audit_finding' | 'external_finding';
  reference: string;
  source: NonconformitySource | 'internal_audit';
  sourceRef: string | null;
  /** major/minor for NCs; critical…low for external audit findings. */
  severity: string | null;
  description: string;
  rootCause: string | null;
  correctiveAction: string | null;
  ownerMemberId: string | null;
  dueDate: string | null;
  status: IsmsAuditFindingStatus;
  closureEvidence: string | null;
  effectivenessReviewedAt: string | null;
  effectivenessReviewedById: string | null;
  effectivenessNotes: string | null;
  createdAt: string;
}

export type NonconformityPayload = Record<string, string | null>;

/** The corrective-action fields an audit finding accepts without reopening its 9.2 sign-off. */
const CAPA_FIELDS = [
  'rootCause',
  'correctiveAction',
  'effectivenessReviewedAt',
  'effectivenessReviewedById',
  'effectivenessNotes',
];

const KEY = '/v1/isms/nonconformities';

async function unwrap<T>(promise: Promise<{ data?: T; error?: string }>) {
  const response = await promise;
  if (response.error) throw new Error(response.error);
  return response.data;
}

export function useNonconformities({
  organizationId,
  fallbackData,
}: {
  organizationId: string;
  fallbackData?: IsmsNonconformityRow[];
}) {
  const { data, error, isLoading, mutate } = useSWR<IsmsNonconformityRow[]>(
    [KEY, organizationId],
    async () => {
      const rows = await unwrap(api.get<{ data: IsmsNonconformityRow[] }>(KEY, organizationId));
      return Array.isArray(rows?.data) ? rows.data : [];
    },
    { fallbackData, revalidateOnMount: !fallbackData },
  );

  const create = async (payload: NonconformityPayload) => {
    await unwrap(api.post(KEY, payload, organizationId));
    await mutate();
  };

  const update = async ({
    row,
    payload,
  }: {
    row: IsmsNonconformityRow;
    payload: NonconformityPayload;
  }) => {
    if (row.kind === 'external_finding') {
      throw new Error('Edit external audit findings under Audits → Findings');
    }
    if (row.kind === 'standalone') {
      await unwrap(api.patch(`${KEY}/${row.id}`, payload, organizationId));
    } else {
      const capa = Object.fromEntries(
        Object.entries(payload).filter(([key]) => CAPA_FIELDS.includes(key)),
      );
      await unwrap(api.patch(`/v1/isms/registers/audit-findings/${row.id}`, capa, organizationId));
    }
    await mutate();
  };

  const importMany = async (rows: NonconformityPayload[]) => {
    const res = await unwrap(api.post<{ count: number }>(`${KEY}/import`, { rows }, organizationId));
    await mutate();
    return res?.count ?? rows.length;
  };

  return {
    rows: Array.isArray(data) ? data : [],
    hasData: data !== undefined,
    error,
    isLoading,
    create,
    update,
    importMany,
  };
}
