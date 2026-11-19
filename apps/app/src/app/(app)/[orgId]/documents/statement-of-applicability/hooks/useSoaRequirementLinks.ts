'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import type { FrameworkScores, RequirementScoreStatus } from '@/lib/control-compliance';
import { useMemo } from 'react';

export interface SoaRowLink {
  href: string;
  /** Read-only implementation status from the mapped controls; null when unknown. */
  implementation: string | null;
}

type FrameworkDetail = {
  requirementDefinitions?: { id: string; identifier: string }[];
  scores?: FrameworkScores;
};

/** Same wording as the SoA PDF (apps/api soa-implementation.ts). */
export function implementationLabel(status: RequirementScoreStatus | undefined): string | null {
  if (status === 'satisfied' || status === 'not_relevant') return 'Implemented';
  if (status === 'in_progress') return 'In progress';
  if (status === 'not_started' || status === 'no_controls') return 'Not started';
  return null;
}

/** Requirement page link + implementation status per SoA closure ("5.1"), from the ISO instance. */
export function useSoaRequirementLinks({
  orgId,
  frameworkInstanceId,
}: {
  orgId: string;
  frameworkInstanceId: string | null;
}): Map<string, SoaRowLink> {
  const { data } = useApiSWR<FrameworkDetail>(
    frameworkInstanceId ? `/v1/frameworks/${frameworkInstanceId}` : null,
    { revalidateOnFocus: false },
  );
  const detail = data?.data;
  return useMemo(() => {
    const links = new Map<string, SoaRowLink>();
    if (!frameworkInstanceId || !Array.isArray(detail?.requirementDefinitions)) return links;
    for (const req of detail.requirementDefinitions) {
      if (!req.identifier.startsWith('A.')) continue;
      links.set(req.identifier.slice(2), {
        href: `/${orgId}/frameworks/${frameworkInstanceId}/requirements/${req.id}`,
        implementation: implementationLabel(detail.scores?.requirements[req.id]?.status),
      });
    }
    return links;
  }, [detail, frameworkInstanceId, orgId]);
}
