import { db } from '@db';
import type { Prisma } from '@db';
import {
  parseRiskMethodologySettings,
  type RiskMethodologySettings,
} from './risk-methodology-settings';

/**
 * Read the org's methodology settings from its 6.1.2 document. The working
 * draft is the source: it is what the methodology editor saves, and an org
 * without the ISMS document gets the defaults.
 */
export async function loadRiskMethodologySettings({
  organizationId,
  client,
}: {
  organizationId: string;
  client?: Prisma.TransactionClient;
}): Promise<RiskMethodologySettings> {
  const doc = await (client ?? db).ismsDocument.findFirst({
    where: { organizationId, type: 'risk_assessment_methodology' },
    select: { draftNarrative: true },
  });
  return parseRiskMethodologySettings(doc?.draftNarrative);
}
