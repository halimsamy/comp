import { describe, expect, it } from 'vitest';
import { tpspChecklist } from './tpsp-checklist';

const now = new Date('2026-11-18T00:00:00Z');

describe('tpspChecklist', () => {
  it('adds the PCI DSS 12.8 items only for vendors in PCI scope', () => {
    expect(tpspChecklist({ vendor: {}, now })).toHaveLength(5);
    const ids = tpspChecklist({ vendor: { handlesCardholderData: true }, now }).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['acknowledgement', 'matrix', 'pci-status']));
  });

  it('treats expired assurance and stale PCI checks as not done', () => {
    const checks = tpspChecklist({
      vendor: {
        affectsCdeSecurity: true,
        assuranceType: 'pci_aoc',
        assuranceExpiresAt: '2026-10-01T00:00:00Z',
        pciStatusCheckedAt: '2025-09-01T00:00:00Z',
      },
      now,
    });
    const done = Object.fromEntries(checks.map((c) => [c.id, c.done]));
    expect(done.assurance).toBe(false);
    expect(done['pci-status']).toBe(false);
  });

  it('marks a complete profile done', () => {
    const checks = tpspChecklist({
      vendor: {
        criticality: 'high',
        handlesCardholderData: true,
        contractStartDate: '2025-01-01T00:00:00Z',
        securityClausesConfirmed: true,
        confidentialityClausesConfirmed: true,
        assuranceType: 'soc2_type2',
        assuranceExpiresAt: '2027-03-31T00:00:00Z',
        tpspAcknowledgementDate: '2025-01-05T00:00:00Z',
        responsibilityMatrix: [{ requirement: '8.4', owner: 'shared' }],
        pciStatusCheckedAt: '2026-06-01T00:00:00Z',
        nextReviewDue: '2027-06-01T00:00:00Z',
      },
      now,
    });
    expect(checks.every((c) => c.done)).toBe(true);
  });
});
