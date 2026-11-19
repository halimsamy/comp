jest.mock('@db', () => jest.requireActual('@prisma/client'));
import {
  type AttentionVendor,
  isVendorInReviewScope,
  vendorNeedsAttention,
} from './vendor-review-status';
import { reviewSignOffError } from './vendor-review-rules';

const now = new Date('2026-11-18T00:00:00Z');
const daysFromNow = (days: number) =>
  new Date(now.getTime() + days * 86_400_000);

const ok: AttentionVendor = {
  status: 'assessed',
  criticality: 'medium',
  handlesCardholderData: false,
  affectsCdeSecurity: false,
  inherentProbability: 'unlikely',
  inherentImpact: 'minor',
  lastReviewedAt: daysFromNow(-100),
  nextReviewDue: daysFromNow(200),
  documents: [],
};

describe('vendorNeedsAttention', () => {
  it('returns no reasons for a classified, reviewed vendor', () => {
    expect(vendorNeedsAttention({ vendor: ok, now })).toEqual([]);
  });

  it('flags unassessed and unclassified vendors', () => {
    expect(
      vendorNeedsAttention({
        vendor: { ...ok, status: 'not_assessed', criticality: null },
        now,
      }),
    ).toEqual(['not_assessed', 'criticality_not_set']);
  });

  it('flags overdue reviews and expiring latest documents', () => {
    expect(
      vendorNeedsAttention({
        vendor: {
          ...ok,
          nextReviewDue: daysFromNow(-1),
          documents: [{ type: 'soc2_type2', expiresAt: daysFromNow(10) }],
        },
        now,
      }),
    ).toEqual(['review_overdue', 'docs_expiring']);
  });

  it('ignores superseded documents', () => {
    expect(
      vendorNeedsAttention({
        vendor: {
          ...ok,
          documents: [
            { type: 'soc2_type2', expiresAt: daysFromNow(-30) },
            { type: 'soc2_type2', expiresAt: daysFromNow(300) },
          ],
        },
        now,
      }),
    ).toEqual([]);
  });

  it('flags never-reviewed vendors only when in scope', () => {
    const never = { ...ok, lastReviewedAt: null, nextReviewDue: null };
    expect(vendorNeedsAttention({ vendor: never, now })).toEqual([]);
    expect(
      vendorNeedsAttention({ vendor: { ...never, criticality: 'high' }, now }),
    ).toEqual(['never_reviewed_in_scope']);
    expect(
      vendorNeedsAttention({
        vendor: {
          ...never,
          criticality: null,
          inherentProbability: 'very_likely',
          inherentImpact: 'severe',
        },
        now,
      }),
    ).toEqual(['criticality_not_set', 'never_reviewed_in_scope']);
  });

  it('never flags archived vendors', () => {
    expect(
      vendorNeedsAttention({
        vendor: { ...ok, status: 'not_assessed', archivedAt: daysFromNow(-1) },
        now,
      }),
    ).toEqual([]);
  });
});

describe('isVendorInReviewScope', () => {
  it('covers criticality, PCI DSS 12.8 scope and high inherent risk', () => {
    expect(isVendorInReviewScope(ok)).toBe(false);
    expect(isVendorInReviewScope({ ...ok, affectsCdeSecurity: true })).toBe(
      true,
    );
    expect(
      isVendorInReviewScope({
        ...ok,
        inherentProbability: 'likely',
        inherentImpact: 'major',
      }),
    ).toBe(true);
  });
});

describe('reviewSignOffError', () => {
  const all = {
    assuranceReviewed: true,
    pciStatusConfirmed: true,
    contractReviewed: true,
    riskReassessed: true,
  };

  it('accepts a complete approval with a real PCI status', () => {
    expect(
      reviewSignOffError({
        input: { outcome: 'approved', checklist: all, pciStatus: 'compliant' },
        inPciScope: true,
      }),
    ).toBeNull();
  });

  it('requires a PCI status when it is confirmed, and never "unknown"', () => {
    expect(
      reviewSignOffError({
        input: { outcome: 'approved', checklist: all },
        inPciScope: true,
      }),
    ).toMatch(/Choose the PCI DSS status/);
    expect(
      reviewSignOffError({
        input: { outcome: 'approved', checklist: all, pciStatus: 'unknown' },
        inPciScope: true,
      }),
    ).toMatch(/cannot be "unknown"/);
  });

  it('requires every check to approve; the PCI one only in PCI scope', () => {
    const noPci = { ...all, pciStatusConfirmed: false };
    expect(
      reviewSignOffError({
        input: { outcome: 'approved', checklist: noPci },
        inPciScope: true,
      }),
    ).toMatch(/every check/);
    expect(
      reviewSignOffError({
        input: { outcome: 'approved', checklist: noPci },
        inPciScope: false,
      }),
    ).toBeNull();
  });

  it('requires a condition for "approved with conditions"', () => {
    const checklist = { ...all, riskReassessed: false };
    expect(
      reviewSignOffError({
        input: {
          outcome: 'approved_with_conditions',
          checklist,
          pciStatus: 'compliant',
          conditions: ['  '],
        },
        inPciScope: true,
      }),
    ).toBe('Add at least one condition');
    expect(
      reviewSignOffError({
        input: {
          outcome: 'approved_with_conditions',
          checklist,
          pciStatus: 'compliant',
          conditions: ['Re-test MFA'],
        },
        inPciScope: true,
      }),
    ).toBeNull();
  });
});
