'use client';

import { useApiSWR } from '@/hooks/use-api-swr';

export type SearchEntryType =
  | 'requirement'
  | 'control'
  | 'policy'
  | 'task'
  | 'risk'
  | 'vendor'
  | 'person'
  | 'isms_document'
  | 'asset'
  | 'vulnerability'
  | 'finding'
  | 'audit'
  | 'questionnaire'
  | 'access_review';

export interface SearchEntry {
  type: SearchEntryType;
  id: string;
  label: string;
  description: string | null;
  keywords: string[];
  parentId: string | null;
}

/** Permission-filtered list of the org's objects for the command palette. Fetched only while the palette is open. */
export function useSearchIndex({ enabled }: { enabled: boolean }) {
  const swr = useApiSWR<{ data: SearchEntry[]; count: number }>('/v1/search/index', {
    enabled,
    dedupingInterval: 60_000,
  });
  const data = swr.data?.data?.data;
  return { ...swr, entries: Array.isArray(data) ? data : [] };
}
