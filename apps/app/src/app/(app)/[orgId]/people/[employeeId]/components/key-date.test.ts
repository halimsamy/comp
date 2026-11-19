import { describe, expect, it } from 'vitest';
import { fromUtcDay, toUtcDay } from './key-date';

describe('key dates (#84)', () => {
  it('stores the picked calendar day as UTC midnight', () => {
    expect(toUtcDay(new Date(2026, 2, 1, 0, 0))).toBe('2026-03-01T00:00:00.000Z');
    expect(toUtcDay(new Date(2026, 2, 1, 23, 59))).toBe('2026-03-01T00:00:00.000Z');
  });

  it('shows a stored UTC day as the same calendar day', () => {
    const day = fromUtcDay('2026-03-01T00:00:00.000Z');
    expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([2026, 2, 1]);
    expect(toUtcDay(fromUtcDay('2026-12-31T00:00:00.000Z'))).toBe('2026-12-31T00:00:00.000Z');
  });
});
