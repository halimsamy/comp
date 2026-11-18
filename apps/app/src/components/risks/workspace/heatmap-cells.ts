import { IMPACT_SCORES, LIKELIHOOD_SCORES } from '@/lib/risk-score';
import type { Impact, Likelihood } from '@db';

export type HeatmapKind = 'inherent' | 'residual';

export interface HeatmapRisk {
  likelihood: Likelihood;
  impact: Impact;
  residualLikelihood: Likelihood;
  residualImpact: Impact;
}

/** A clicked cell, encoded in the URL as `inherent:4:3` (kind:likelihood:impact scores). */
export interface HeatmapCell {
  kind: HeatmapKind;
  likelihood: number;
  impact: number;
}

function ratingOf({ risk, kind }: { risk: HeatmapRisk; kind: HeatmapKind }) {
  return kind === 'inherent'
    ? { likelihood: LIKELIHOOD_SCORES[risk.likelihood], impact: IMPACT_SCORES[risk.impact] }
    : {
        likelihood: LIKELIHOOD_SCORES[risk.residualLikelihood],
        impact: IMPACT_SCORES[risk.residualImpact],
      };
}

/** counts[likelihood-1][impact-1] = number of risks rated there. */
export function buildHeatmapCounts({
  risks,
  kind,
}: {
  risks: HeatmapRisk[];
  kind: HeatmapKind;
}): number[][] {
  const counts = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
  for (const risk of risks) {
    const { likelihood, impact } = ratingOf({ risk, kind });
    counts[likelihood - 1][impact - 1] += 1;
  }
  return counts;
}

export function formatHeatmapCell(cell: HeatmapCell): string {
  return `${cell.kind}:${cell.likelihood}:${cell.impact}`;
}

export function parseHeatmapCell(value: string | null | undefined): HeatmapCell | null {
  const match = /^(inherent|residual):([1-5]):([1-5])$/.exec(value ?? '');
  if (!match) return null;
  return {
    kind: match[1] === 'inherent' ? 'inherent' : 'residual',
    likelihood: Number(match[2]),
    impact: Number(match[3]),
  };
}

export function riskInCell({ risk, cell }: { risk: HeatmapRisk; cell: HeatmapCell }): boolean {
  const rating = ratingOf({ risk, kind: cell.kind });
  return rating.likelihood === cell.likelihood && rating.impact === cell.impact;
}
