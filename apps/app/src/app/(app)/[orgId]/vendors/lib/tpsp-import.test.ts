import type { Vendor } from '@/hooks/use-vendors';
import { describe, expect, it } from 'vitest';
import { previewToUpdates, previewTpspImport } from './tpsp-csv';
import { suggestClassification } from './vendor-classify';

const vendor = (over: Partial<Vendor>): Vendor =>
  ({
    id: 'vnd_1',
    name: 'Stripe',
    description: '',
    category: 'other',
    status: 'assessed',
    inherentProbability: 'possible',
    inherentImpact: 'moderate',
    handlesCardholderData: false,
    affectsCdeSecurity: false,
    criticality: null,
    contractEndDate: null,
    ...over,
  }) as Vendor;

describe('previewTpspImport', () => {
  it('matches by name and lists only real changes', () => {
    const preview = previewTpspImport({
      text: 'Vendor,Criticality,Contract end,Shares account data,PCI status,Notes\n' +
        'stripe,High,2027-01-31,yes,Non-compliant,ignored\n' +
        '"Unknown Co",low,,,,\n',
      vendors: [vendor({ criticality: 'high' })],
    });
    expect(preview.error).toBeNull();
    expect(preview.unmatched).toEqual(['Unknown Co']);
    expect(preview.matched[0].changes.map((c) => c.field)).toEqual([
      'contractEndDate',
      'handlesCardholderData',
      'pciStatus',
    ]);
    expect(previewToUpdates(preview)).toEqual([
      {
        id: 'vnd_1',
        contractEndDate: '2027-01-31T00:00:00.000Z',
        handlesCardholderData: true,
        pciStatus: 'non_compliant',
      },
    ]);
  });

  it('explains files it cannot use', () => {
    expect(previewTpspImport({ text: '', vendors: [] }).error).toMatch(/empty/);
    expect(previewTpspImport({ text: 'criticality\nhigh', vendors: [] }).error).toMatch(/name/);
    expect(previewTpspImport({ text: 'name,color\nx,red', vendors: [] }).error).toMatch(/No TPSP/);
  });
});

describe('suggestClassification', () => {
  it('suggests criticality from inherent risk and PCI scope from category and wording', () => {
    expect(
      suggestClassification(
        vendor({ category: 'finance', inherentProbability: 'very_likely', inherentImpact: 'severe' }),
      ),
    ).toMatchObject({ criticality: 'critical', handlesCardholderData: true, affectsCdeSecurity: false });
    expect(
      suggestClassification(vendor({ category: 'cloud', description: 'Hosting' })),
    ).toMatchObject({ criticality: 'low', handlesCardholderData: false, affectsCdeSecurity: true });
    expect(
      suggestClassification(vendor({ description: 'Card payment gateway' })).handlesCardholderData,
    ).toBe(true);
  });
});
