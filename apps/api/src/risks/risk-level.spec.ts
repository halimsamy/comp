import { getRiskLevel, getRiskLevelFromScore, getRiskScore, ratingLevel } from './risk-level';

describe('risk level banding', () => {
  it('bands raw 9 as low, like the normalized score (score 4)', () => {
    expect(getRiskLevel(9)).toBe('low');
    expect(getRiskScore('possible', 'moderate')).toEqual({ raw: 9, score: 4, level: 'low' });
  });

  it('getRiskLevel(raw) and ratingLevel agree with the score bands for every rating', () => {
    for (let raw = 1; raw <= 25; raw++) {
      expect(getRiskLevel(raw)).toBe(getRiskLevelFromScore(Math.max(1, Math.ceil(raw / 2.5))));
    }
    expect(ratingLevel('likely', 'major')).toBe(getRiskScore('likely', 'major').level);
    expect(getRiskLevel(1)).toBe('very-low');
    expect(getRiskLevel(25)).toBe('very-high');
  });
});
