import { describe, expect, it } from 'vitest';
import { rangeLabel } from './DateRangeField';

describe('rangeLabel', () => {
  it('reads "All time" when no bound is set', () => {
    expect(rangeLabel({ from: '', to: '' })).toBe('All time');
    expect(rangeLabel({ from: '2026-01-01', to: '2026-12-31' })).toBe('Jan 1, 2026 – Dec 31, 2026');
    expect(rangeLabel({ from: '2026-01-01', to: '' })).toBe('From Jan 1, 2026');
  });
});
