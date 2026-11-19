import { describe, expect, it } from 'vitest';
import { isMatrixComplete, tpspChecklist } from './tpsp-checklist';

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
        responsibilityMatrix: [
          { requirement: '8.4', owner: 'shared', notes: 'We run MFA', confirmed: true },
        ],
        pciStatus: 'compliant',
        pciStatusCheckedAt: '2026-06-01T00:00:00Z',
        nextReviewDue: '2027-06-01T00:00:00Z',
      },
      now,
    });
    expect(checks.every((c) => c.done)).toBe(true);
  });

  it('does not count a recent check with an unknown PCI status', () => {
    const checks = tpspChecklist({
      vendor: {
        handlesCardholderData: true,
        pciStatus: 'unknown',
        pciStatusCheckedAt: '2026-11-01T00:00:00Z',
      },
      now,
    });
    expect(checks.find((c) => c.id === 'pci-status')?.done).toBe(false);
  });
});

describe('isMatrixComplete', () => {
  it('needs every row confirmed and a note on shared rows', () => {
    expect(isMatrixComplete([])).toBe(false);
    expect(isMatrixComplete([{ requirement: '1', owner: 'tpsp' }])).toBe(false);
    expect(isMatrixComplete([{ requirement: '1', owner: 'shared', confirmed: true }])).toBe(false);
    expect(
      isMatrixComplete([
        { requirement: '1', owner: 'tpsp', confirmed: true },
        { requirement: '8', owner: 'shared', notes: 'MFA is ours', confirmed: true },
      ]),
    ).toBe(true);
  });
});
