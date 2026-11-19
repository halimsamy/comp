import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TPSP_FILTERS,
  expiryLabel,
  filtersFromSearchParams,
  matchesTpspFilters,
  reviewCadenceMonths,
} from './vendor-tpsp';

const now = new Date('2026-11-18T00:00:00Z');

describe('expiryLabel', () => {
  it('flags expired and expiring documents', () => {
    expect(expiryLabel({ expiresAt: null, now }).label).toBe('No expiry');
    expect(expiryLabel({ expiresAt: '2026-11-10T00:00:00Z', now })).toMatchObject({
      label: 'Expired',
      variant: 'destructive',
    });
    expect(expiryLabel({ expiresAt: '2026-12-08T00:00:00Z', now }).label).toBe('Expires in 20d');
    expect(expiryLabel({ expiresAt: '2027-06-01T00:00:00Z', now }).label).toMatch(/^Valid until/);
  });
});

describe('matchesTpspFilters', () => {
  const vendor = {
    criticality: null,
    reviewStatus: 'overdue' as const,
    expiringDocumentsCount: 0,
    status: 'assessed' as const,
    attentionReasons: ['review_overdue' as const],
  };

  it('filters unassessed vendors and vendors needing attention', () => {
    const notAssessed = { ...DEFAULT_TPSP_FILTERS, assessment: 'not_assessed' as const };
    expect(matchesTpspFilters({ vendor, filters: notAssessed })).toBe(false);
    expect(
      matchesTpspFilters({ vendor: { ...vendor, status: 'not_assessed' }, filters: notAssessed }),
    ).toBe(true);
    const attention = { ...DEFAULT_TPSP_FILTERS, assessment: 'needs_attention' as const };
    expect(matchesTpspFilters({ vendor, filters: attention })).toBe(true);
    expect(
      matchesTpspFilters({ vendor: { ...vendor, attentionReasons: [] }, filters: attention }),
    ).toBe(false);
  });

  it('reads filters from the URL', () => {
    const params = new URLSearchParams('status=not_assessed&criticality=unset');
    expect(filtersFromSearchParams(params)).toMatchObject({
      assessment: 'not_assessed',
      criticality: 'unset',
    });
    expect(filtersFromSearchParams(new URLSearchParams('criticality=bogus'))).toEqual(
      DEFAULT_TPSP_FILTERS,
    );
  });

  it('passes everything with the default filters', () => {
    expect(matchesTpspFilters({ vendor, filters: DEFAULT_TPSP_FILTERS })).toBe(true);
  });

  it('filters by criticality, treating null as unset', () => {
    expect(
      matchesTpspFilters({ vendor, filters: { ...DEFAULT_TPSP_FILTERS, criticality: 'unset' } }),
    ).toBe(true);
    expect(
      matchesTpspFilters({ vendor, filters: { ...DEFAULT_TPSP_FILTERS, criticality: 'high' } }),
    ).toBe(false);
  });

  it('filters by review status and expiring documents', () => {
    expect(
      matchesTpspFilters({ vendor, filters: { ...DEFAULT_TPSP_FILTERS, review: 'overdue' } }),
    ).toBe(true);
    expect(
      matchesTpspFilters({ vendor, filters: { ...DEFAULT_TPSP_FILTERS, review: 'current' } }),
    ).toBe(false);
    expect(
      matchesTpspFilters({ vendor, filters: { ...DEFAULT_TPSP_FILTERS, documents: 'expiring' } }),
    ).toBe(false);
    expect(
      matchesTpspFilters({
        vendor: { ...vendor, expiringDocumentsCount: 2 },
        filters: { ...DEFAULT_TPSP_FILTERS, documents: 'expiring' },
      }),
    ).toBe(true);
  });
});

describe('reviewCadenceMonths', () => {
  it('matches the API cadence', () => {
    expect(reviewCadenceMonths({ criticality: 'critical' })).toBe(6);
    expect(reviewCadenceMonths({ criticality: 'low' })).toBe(24);
    expect(reviewCadenceMonths({ criticality: 'low', handlesCardholderData: true })).toBe(12);
    expect(reviewCadenceMonths({})).toBe(12);
  });
});
