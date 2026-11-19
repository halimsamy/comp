import { describe, expect, it } from 'vitest';
import { listedCompliance, trustUrlFrom } from './ListedCompliance';

describe('listedCompliance', () => {
  it('suggests listed certifications the vendor record does not show yet', () => {
    expect(
      listedCompliance({
        complianceBadges: [{ type: 'pci_dss' }, { type: 'soc2' }, { type: 'gdpr' }],
        pciStatus: 'unknown',
        assuranceType: null,
      }),
    ).toEqual(['pci_dss', 'soc2']);
    expect(
      listedCompliance({
        complianceBadges: [{ type: 'pci_dss' }, { type: 'iso27001' }],
        pciStatus: 'compliant',
        assuranceType: 'iso27001',
      }),
    ).toEqual([]);
  });
});

describe('trustUrlFrom', () => {
  it('finds the trust center link and tolerates missing research', () => {
    expect(trustUrlFrom(null)).toBeNull();
    expect(
      trustUrlFrom({
        kind: 'vendorRiskAssessmentV1',
        links: [
          { label: 'Website', url: 'https://x.com' },
          { label: 'Trust Center', url: 'https://trust.x.com' },
        ],
      }),
    ).toBe('https://trust.x.com');
  });
});
