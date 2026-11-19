const mockFindMany = jest.fn();
jest.mock('@db', () => ({
  db: {
    frameworkInstance: { findMany: (...a: unknown[]) => mockFindMany(...a) },
  },
}));

import {
  liveFrameworkStatus,
  trustKeyForFramework,
} from './trust-live-framework-status';

describe('trustKeyForFramework', () => {
  it.each([
    ['ISO 27001', 'iso27001'],
    ['PCI DSS Level 1', 'pcidss'],
    ['PCI-DSS v4.0.1', 'pcidss'],
    ['SOC 2', 'soc2type2'],
    ['SOC 2 Type 1', 'soc2type1'],
    ['SOC 2 Type I', 'soc2type1'],
    ['HIPAA', 'hipaa'],
    ['NEN 7510', 'nen7510'],
  ])('%s → %s', (name, key) => {
    expect(trustKeyForFramework(name)).toBe(key);
  });

  it('ignores frameworks the trust portal has no card for', () => {
    expect(trustKeyForFramework('NIST CSF')).toBeNull();
  });
});

describe('liveFrameworkStatus', () => {
  const now = new Date('2026-11-18T00:00:00Z');

  it('is in progress for added frameworks and compliant with a recent completed audit', async () => {
    mockFindMany.mockResolvedValue([
      { framework: { name: 'ISO 27001' }, auditEngagements: [] },
      {
        framework: { name: 'PCI DSS Level 1' },
        auditEngagements: [{ id: 'aud_1' }],
      },
      { framework: { name: 'NIST CSF' }, auditEngagements: [] },
    ]);
    await expect(liveFrameworkStatus('org_1', now)).resolves.toEqual({
      iso27001: 'in_progress',
      pcidss: 'compliant',
    });
    const where = mockFindMany.mock.calls[0][0];
    expect(where.where).toEqual({ organizationId: 'org_1' });
    expect(where.select.auditEngagements.where).toEqual({
      organizationId: 'org_1',
      status: 'completed',
      periodEnd: { gte: new Date('2025-11-18T00:00:00Z') },
    });
  });
});
