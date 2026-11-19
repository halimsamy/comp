import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatDay, formatPeriod } from './audit-labels';

// #99: a viewer east of UTC saw end-of-day UTC dates one day late.
describe('formatDay under UTC+2', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Etc/GMT-2'; // POSIX sign is inverted: this is UTC+2
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('formats the UTC day, not the local one', () => {
    expect(formatDay('2026-03-31T23:59:59.999Z')).toBe('Mar 31, 2026');
    expect(formatDay('2026-01-01T00:00:00.000Z')).toBe('Jan 1, 2026');
  });

  it('formats an audit period in UTC', () => {
    expect(
      formatPeriod({ periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-12-31T23:59:59.999Z' }),
    ).toBe('Jan 1, 2026 – Dec 31, 2026');
  });
});
