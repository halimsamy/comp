import { describe, expect, it } from 'vitest';
import { paletteScore } from './palette-filter';

const rank = (search: string, items: Array<[string, string[]?]>) =>
  items
    .map(([value, keywords]) => ({ value, score: paletteScore(value, search, keywords) }))
    .filter((i) => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((i) => i.value);

describe('paletteScore', () => {
  it("puts the exact code first for 'A.5.15', then code prefixes, before text matches", () => {
    const result = rank('A.5.15', [
      ['ISO 27001 A.5.15 · Access control'],
      ['ISO 27001 A.5.1 · Policies for information security'],
      ['ISO 27001 A.5.16 · Identity management'],
      ['ISO 27001 A.5.150 · Hypothetical'],
      ['Access Control Policy', ['A.5.15 A.8.3']],
    ]);
    expect(result.slice(0, 2).sort()).toEqual(
      ['Access Control Policy', 'ISO 27001 A.5.15 · Access control'].sort(),
    );
    expect(result[2]).toBe('ISO 27001 A.5.150 · Hypothetical');
    expect(result).not.toContain('ISO 27001 A.5.16 · Identity management');
    expect(result).not.toContain('ISO 27001 A.5.1 · Policies for information security');
  });

  it("ranks title word-starts for 'clean desk' above keyword and fuzzy hits", () => {
    const result = rank('clean desk', [
      ['Change Management Policy', ['includes a clean desk rule']],
      ['Clean Desk and Clear Screen Policy'],
      ['ISO 27001 A.7.7 · Clear desk and clear screen', ['clean desk']],
    ]);
    expect(result[0]).toBe('Clean Desk and Clear Screen Policy');
    expect(result).toHaveLength(3);
  });

  it("finds the vendor 'Amazon' ahead of fuzzy matches", () => {
    const result = rank('Amazon', [
      ['Asset Management Zone Review'],
      ['Amazon Web Services', ['aws.amazon.com']],
      ['Payments', ['amazon pay']],
    ]);
    expect(result[0]).toBe('Amazon Web Services');
    expect(result[1]).toBe('Payments');
    expect(result).toContain('Asset Management Zone Review');
    expect(paletteScore('Asset Management Zone Review', 'Amazon')).toBeLessThan(0.1);
  });

  it('returns 0 for no match and 1 for an empty search', () => {
    expect(paletteScore('Vendors', 'xyz')).toBe(0);
    expect(paletteScore('Vendors', '  ')).toBe(1);
  });
});
