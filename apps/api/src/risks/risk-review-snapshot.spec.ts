import { buildRiskReviewSnapshot, type SnapshotRiskInput } from './risk-review-snapshot';
import {
  addMonths,
  isAcceptanceRequired,
  parseRiskMethodologySettings,
} from './risk-methodology-settings';

const base: SnapshotRiskInput = {
  id: 'rsk_1',
  title: 'PAN exposure',
  category: 'technology',
  status: 'open',
  likelihood: 'likely', // 4
  impact: 'severe', // 5 -> raw 20 -> score 8 -> high
  residualLikelihood: 'possible', // 3
  residualImpact: 'major', // 4 -> raw 12 -> score 5 -> medium
  treatmentStrategy: 'mitigate',
  ownerName: 'Jane',
  latestAcceptance: null,
  openActions: 2,
  overdueActions: 1,
};

describe('buildRiskReviewSnapshot', () => {
  it('counts levels, owners, actions and acceptance states', () => {
    const snapshot = buildRiskReviewSnapshot({
      threshold: 'medium',
      risks: [
        base,
        {
          ...base,
          id: 'rsk_2',
          ownerName: null,
          residualLikelihood: 'unlikely',
          residualImpact: 'minor', // very-low: below threshold
          openActions: 0,
          overdueActions: 0,
        },
        {
          ...base,
          id: 'rsk_3',
          latestAcceptance: { residualLikelihood: 'likely', residualImpact: 'major' },
        },
        {
          ...base,
          id: 'rsk_4',
          latestAcceptance: { residualLikelihood: 'possible', residualImpact: 'major' },
        },
      ],
    });

    expect(snapshot.risks.map((r) => r.acceptance)).toEqual([
      'awaiting',
      'not_required',
      'stale',
      'accepted',
    ]);
    expect(snapshot.totals).toMatchObject({
      risks: 4,
      withoutOwner: 1,
      awaitingAcceptance: 1,
      staleAcceptance: 1,
      openActions: 6,
      overdueActions: 3,
    });
    expect(snapshot.totals.byInherentLevel.high).toBe(4);
    expect(snapshot.totals.byResidualLevel).toMatchObject({ medium: 3, 'very-low': 1 });
    expect(snapshot.risks[0]).toMatchObject({ inherentLevel: 'high', residualLevel: 'medium' });
  });
});

describe('risk methodology settings', () => {
  it('defaults when the narrative has no settings or is malformed', () => {
    expect(parseRiskMethodologySettings(null)).toEqual({
      acceptanceRequiredFromLevel: 'medium',
      reviewIntervalMonths: 3,
    });
    expect(parseRiskMethodologySettings({ reviewIntervalMonths: 'x' })).toEqual({
      acceptanceRequiredFromLevel: 'medium',
      reviewIntervalMonths: 3,
    });
  });

  it('reads configured settings', () => {
    expect(
      parseRiskMethodologySettings({ purpose: 'p', acceptanceRequiredFromLevel: 'high', reviewIntervalMonths: 12 }),
    ).toEqual({ acceptanceRequiredFromLevel: 'high', reviewIntervalMonths: 12 });
  });

  it('adds months clamped to the end of the target month', () => {
    expect(addMonths({ date: new Date(2026, 0, 31), months: 1 })).toEqual(new Date(2026, 1, 28));
    expect(addMonths({ date: new Date(2026, 10, 18), months: 3 })).toEqual(new Date(2027, 1, 18));
  });

  it('requires acceptance at and above the threshold', () => {
    expect(isAcceptanceRequired({ level: 'medium', threshold: 'medium' })).toBe(true);
    expect(isAcceptanceRequired({ level: 'very-high', threshold: 'medium' })).toBe(true);
    expect(isAcceptanceRequired({ level: 'low', threshold: 'medium' })).toBe(false);
  });
});
