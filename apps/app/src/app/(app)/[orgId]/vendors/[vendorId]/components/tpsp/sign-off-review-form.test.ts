import type { VendorDocument } from '@/hooks/use-vendor-tpsp';
import { describe, expect, it } from 'vitest';
import { signOffDefaults, signOffSchema, toSignOffInput } from './sign-off-review-form';

const doc = (over: Partial<VendorDocument>): VendorDocument => ({
  id: 'vdoc_1',
  vendorId: 'vnd_1',
  type: 'soc2_type2',
  name: 'SOC 2',
  periodStart: null,
  periodEnd: '2025-12-31',
  expiresAt: null,
  expiringSoon: false,
  aiSummary: null,
  aiSummaryStatus: null,
  createdAt: '2026-01-01',
  attachment: { name: 'a.pdf', type: 'document', createdAt: '2026-01-01' },
  ...over,
});

describe('signOffDefaults', () => {
  it('prefills the newest assurance report and the PCI status from the newest AOC', () => {
    const defaults = signOffDefaults({
      currentPciStatus: 'unknown',
      documents: [
        doc({ id: 'old_aoc', type: 'pci_aoc', periodEnd: '2024-06-30' }),
        doc({ id: 'dpa', type: 'dpa', periodEnd: '2027-01-01' }),
        doc({
          id: 'new_aoc',
          type: 'pci_aoc',
          periodEnd: '2026-06-30',
          aiSummary: { opinion: 'non_compliant' } as VendorDocument['aiSummary'],
        }),
      ],
    });
    expect(defaults.reviewedDocumentIds).toEqual(['new_aoc']);
    expect(defaults.pciStatus).toBe('non_compliant');
  });

  it('falls back to the known vendor status, never "unknown"', () => {
    expect(signOffDefaults({ documents: [], currentPciStatus: 'compliant' }).pciStatus).toBe(
      'compliant',
    );
    expect(signOffDefaults({ documents: [], currentPciStatus: 'unknown' }).pciStatus).toBe('');
  });
});

describe('signOffSchema', () => {
  const base = { ...signOffDefaults({ documents: [], currentPciStatus: null }) };
  const allChecked = {
    ...base,
    assuranceReviewed: true,
    contractReviewed: true,
    riskReassessed: true,
    pciStatusConfirmed: true,
    pciStatus: 'compliant' as const,
  };

  it('approves only with every check (PCI only in scope)', () => {
    expect(signOffSchema({ inPciScope: true }).safeParse(allChecked).success).toBe(true);
    const noPci = { ...allChecked, pciStatusConfirmed: false };
    expect(signOffSchema({ inPciScope: true }).safeParse(noPci).success).toBe(false);
    expect(signOffSchema({ inPciScope: false }).safeParse(noPci).success).toBe(true);
  });

  it('rejects a confirmed "unknown" status and conditional approval without conditions', () => {
    const schema = signOffSchema({ inPciScope: true });
    expect(schema.safeParse({ ...allChecked, pciStatus: 'unknown' }).success).toBe(false);
    expect(
      schema.safeParse({ ...base, outcome: 'approved_with_conditions', conditions: [{ text: ' ' }] })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...base, outcome: 'approved_with_conditions', conditions: [{ text: 'X' }] })
        .success,
    ).toBe(true);
  });

  it('maps conditions and the confirmed status into the API input', () => {
    const input = toSignOffInput({
      ...allChecked,
      outcome: 'approved_with_conditions',
      conditions: [{ text: ' Bridge letter ' }, { text: '' }],
    });
    expect(input.conditions).toEqual(['Bridge letter']);
    expect(input.pciStatus).toBe('compliant');
  });
});
