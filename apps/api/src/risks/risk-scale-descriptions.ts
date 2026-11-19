import { db } from '@db';
import { z } from 'zod';
import {
  DEFAULT_IMPACT_DESCRIPTIONS,
  DEFAULT_LIKELIHOOD_DESCRIPTIONS,
} from '../isms/documents/risk-methodology-defaults';

const fiveStrings = z.array(z.string()).length(5);
const scaleSchema = z.object({
  likelihoodDescriptions: fiveStrings.optional(),
  impactDescriptions: fiveStrings.optional(),
});

/**
 * The 6.1.2 methodology's likelihood and impact definitions (ascending, five
 * each), so rating pickers show what each level means. Defaults when the
 * org has no methodology document or it is malformed.
 */
export function parseRiskScaleDescriptions(narrative: unknown) {
  const parsed = scaleSchema.safeParse(narrative ?? {});
  const values = parsed.success ? parsed.data : {};
  return {
    likelihoodDescriptions:
      values.likelihoodDescriptions ?? [...DEFAULT_LIKELIHOOD_DESCRIPTIONS],
    impactDescriptions:
      values.impactDescriptions ?? [...DEFAULT_IMPACT_DESCRIPTIONS],
  };
}

export async function loadRiskScaleDescriptions({
  organizationId,
}: {
  organizationId: string;
}) {
  const doc = await db.ismsDocument.findFirst({
    where: { organizationId, type: 'risk_assessment_methodology' },
    select: { draftNarrative: true },
  });
  return parseRiskScaleDescriptions(doc?.draftNarrative);
}
