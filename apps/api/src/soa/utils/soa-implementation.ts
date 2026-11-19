import { db } from '@db';
import { loadRequirementDefinitions } from '../../frameworks/frameworks-requirements.helper';
import type { RequirementScoreStatus } from '../../frameworks/scoring/framework-scoring';
import { loadInstanceScoring } from '../../frameworks/scoring/requirement-scoring';

export type SoaImplementation = 'Implemented' | 'In progress' | 'Not started';

/** Implementation status of an Annex A row, from its mapped controls' evidence. */
export function implementationLabel(
  status: RequirementScoreStatus | null | undefined,
): SoaImplementation | null {
  if (status === 'satisfied' || status === 'not_relevant') return 'Implemented';
  if (status === 'in_progress') return 'In progress';
  if (status === 'not_started' || status === 'no_controls') return 'Not started';
  return null;
}

/**
 * Implementation status per SoA closure ("5.15" -> "Implemented") for the
 * org's ISO instance. Empty when the org has no instance of the framework.
 */
export async function loadSoaImplementation({
  organizationId,
  frameworkId,
}: {
  organizationId: string;
  frameworkId: string;
}): Promise<Map<string, SoaImplementation>> {
  const instance = await db.frameworkInstance.findFirst({
    where: { organizationId, frameworkId },
    select: { id: true, frameworkId: true, customFrameworkId: true, currentVersionId: true },
  });
  if (!instance) return new Map();
  const requirements = await loadRequirementDefinitions(instance);
  const { scores } = await loadInstanceScoring({
    organizationId,
    frameworkInstanceId: instance.id,
    requirementKeys: requirements.map((r) => r.id),
  });
  const result = new Map<string, SoaImplementation>();
  for (const requirement of requirements) {
    if (!requirement.identifier.startsWith('A.')) continue;
    const label = implementationLabel(scores.requirements[requirement.id]?.status);
    if (label) result.set(requirement.identifier.slice(2), label);
  }
  return result;
}
