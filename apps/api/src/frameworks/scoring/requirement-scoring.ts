import { db } from '@db';
import { applicabilityRules } from '../applicability/applicability-rules';
import { loadFrameworkScores } from './framework-scoring.loader';

export const applicabilitySelect = {
  id: true,
  requirementKey: true,
  status: true,
  justification: true,
  details: true,
  source: true,
  updatedAt: true,
  updatedBy: { select: { id: true, user: { select: { name: true, email: true } } } },
} as const;

/** Framework score plus every applicability record of one instance. */
export async function loadInstanceScoring({
  organizationId,
  frameworkInstanceId,
  requirementKeys,
}: {
  organizationId: string;
  frameworkInstanceId: string;
  requirementKeys: string[];
}) {
  const [scores, applicability] = await Promise.all([
    loadFrameworkScores({
      organizationId,
      frameworkInstanceIds: [frameworkInstanceId],
      requirementKeys: new Map([[frameworkInstanceId, requirementKeys]]),
    }),
    db.requirementApplicability.findMany({
      where: { organizationId, frameworkInstanceId },
      select: applicabilitySelect,
    }),
  ]);
  return { scores: scores.get(frameworkInstanceId)!, applicability };
}

/** Score, control scores and applicability for one requirement page. */
export async function loadRequirementScoring({
  organizationId,
  frameworkInstanceId,
  frameworkName,
  requirement,
  requirementKeys,
  controlIds,
}: {
  organizationId: string;
  frameworkInstanceId: string;
  frameworkName: string | null | undefined;
  requirement: { id: string; identifier: string | null };
  requirementKeys: string[];
  controlIds: string[];
}) {
  const { scores, applicability } = await loadInstanceScoring({
    organizationId,
    frameworkInstanceId,
    requirementKeys,
  });
  return {
    requirementScore: scores.requirements[requirement.id] ?? null,
    controlScores: Object.fromEntries(
      controlIds.filter((id) => scores.controls[id]).map((id) => [id, scores.controls[id]]),
    ),
    applicability: applicability.find((a) => a.requirementKey === requirement.id) ?? null,
    applicabilityRules: applicabilityRules({
      frameworkName,
      requirementIdentifier: requirement.identifier,
    }),
  };
}
