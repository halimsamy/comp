import { describe, expect, it } from 'vitest';
import { getRiskLevel, getRiskLevelFromScore, getRiskScore } from './risk-score';

describe('getRiskScore', () => {
  it('returns 1/10 very-low at the minimum corner (1×1)', () => {
    expect(getRiskScore('very_unlikely', 'insignificant')).toEqual({
      raw: 1,
      score: 1,
      level: 'very-low',
    });
  });

  it('returns 10/10 very-high at the maximum corner (5×5)', () => {
    expect(getRiskScore('very_likely', 'severe')).toEqual({
      raw: 25,
      score: 10,
      level: 'very-high',
    });
  });

  it('computes raw as likelihood × impact', () => {
    expect(getRiskScore('possible', 'moderate').raw).toBe(9);
    expect(getRiskScore('likely', 'major').raw).toBe(16);
    expect(getRiskScore('very_likely', 'major').raw).toBe(20);
  });

  it('normalizes raw 1–25 into a 1–10 integer score', () => {
    for (const l of ['very_unlikely', 'unlikely', 'possible', 'likely', 'very_likely'] as const) {
      for (const i of ['insignificant', 'minor', 'moderate', 'major', 'severe'] as const) {
        const { score } = getRiskScore(l, i);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
        expect(Number.isInteger(score)).toBe(true);
      }
    }
  });
});

describe('getRiskLevel', () => {
  it('bands raw products with the normalized-score rule published in 6.1.2', () => {
    expect(getRiskLevel(1)).toBe('very-low');
    expect(getRiskLevel(5)).toBe('very-low');
    expect(getRiskLevel(6)).toBe('low');
    expect(getRiskLevel(9)).toBe('low');
    expect(getRiskLevel(10)).toBe('low');
    expect(getRiskLevel(12)).toBe('medium');
    expect(getRiskLevel(15)).toBe('medium');
    expect(getRiskLevel(16)).toBe('high');
    expect(getRiskLevel(20)).toBe('high');
    expect(getRiskLevel(25)).toBe('very-high');
  });

  it('never disagrees with getRiskLevelFromScore for any rating', () => {
    for (let raw = 1; raw <= 25; raw++) {
      expect(getRiskLevel(raw)).toBe(getRiskLevelFromScore(Math.max(1, Math.ceil(raw / 2.5))));
    }
    expect(getRiskScore('possible', 'moderate').level).toBe('low');
  });
});
