import type { Impact, Likelihood } from '@db';
import { ratingLevel, type RiskLevel } from './risk-level';
import { isAcceptanceRequired, RISK_LEVELS } from './risk-methodology-settings';

export type ReviewAcceptanceState = 'accepted' | 'awaiting' | 'stale' | 'not_required';

export interface SnapshotRiskInput {
  id: string;
  title: string;
  category: string;
  status: string;
  likelihood: Likelihood;
  impact: Impact;
  residualLikelihood: Likelihood;
  residualImpact: Impact;
  treatmentStrategy: string;
  ownerName: string | null;
  latestAcceptance: { residualLikelihood: Likelihood; residualImpact: Impact } | null;
  openActions: number;
  overdueActions: number;
}

// A type alias (not an interface) so it is assignable to Prisma's JSON input type.
export type RiskReviewSnapshot = {
  acceptanceRequiredFromLevel: RiskLevel;
  totals: {
    risks: number;
    byInherentLevel: Record<RiskLevel, number>;
    byResidualLevel: Record<RiskLevel, number>;
    withoutOwner: number;
    awaitingAcceptance: number;
    staleAcceptance: number;
    openActions: number;
    overdueActions: number;
  };
  risks: Array<{
    id: string;
    title: string;
    category: string;
    status: string;
    inherentLevel: RiskLevel;
    residualLevel: RiskLevel;
    treatmentStrategy: string;
    ownerName: string | null;
    acceptance: ReviewAcceptanceState;
    openActions: number;
    overdueActions: number;
  }>;
};

const emptyLevelCounts = (): Record<RiskLevel, number> =>
  Object.fromEntries(RISK_LEVELS.map((level) => [level, 0])) as Record<RiskLevel, number>;

function acceptanceState({
  risk,
  residualLevel,
  threshold,
}: {
  risk: SnapshotRiskInput;
  residualLevel: RiskLevel;
  threshold: RiskLevel;
}): ReviewAcceptanceState {
  const latest = risk.latestAcceptance;
  if (!latest) {
    return isAcceptanceRequired({ level: residualLevel, threshold })
      ? 'awaiting'
      : 'not_required';
  }
  const stale =
    latest.residualLikelihood !== risk.residualLikelihood ||
    latest.residualImpact !== risk.residualImpact;
  return stale ? 'stale' : 'accepted';
}

/** Freeze the register as reviewed (ISO 27001 8.2 evidence). */
export function buildRiskReviewSnapshot({
  risks,
  threshold,
}: {
  risks: SnapshotRiskInput[];
  threshold: RiskLevel;
}): RiskReviewSnapshot {
  const totals: RiskReviewSnapshot['totals'] = {
    risks: risks.length,
    byInherentLevel: emptyLevelCounts(),
    byResidualLevel: emptyLevelCounts(),
    withoutOwner: 0,
    awaitingAcceptance: 0,
    staleAcceptance: 0,
    openActions: 0,
    overdueActions: 0,
  };

  const rows = risks.map((risk) => {
    const inherentLevel = ratingLevel(risk.likelihood, risk.impact);
    const residualLevel = ratingLevel(risk.residualLikelihood, risk.residualImpact);
    const acceptance = acceptanceState({ risk, residualLevel, threshold });
    totals.byInherentLevel[inherentLevel] += 1;
    totals.byResidualLevel[residualLevel] += 1;
    if (!risk.ownerName) totals.withoutOwner += 1;
    if (acceptance === 'awaiting') totals.awaitingAcceptance += 1;
    if (acceptance === 'stale') totals.staleAcceptance += 1;
    totals.openActions += risk.openActions;
    totals.overdueActions += risk.overdueActions;
    return {
      id: risk.id,
      title: risk.title,
      category: risk.category,
      status: risk.status,
      inherentLevel,
      residualLevel,
      treatmentStrategy: risk.treatmentStrategy,
      ownerName: risk.ownerName,
      acceptance,
      openActions: risk.openActions,
      overdueActions: risk.overdueActions,
    };
  });

  return { acceptanceRequiredFromLevel: threshold, totals, risks: rows };
}
