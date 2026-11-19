const mockDb = {
  asset: { findMany: jest.fn() },
  integrationPlatformFinding: { findMany: jest.fn() },
  finding: { findMany: jest.fn() },
  auditEngagement: { findMany: jest.fn() },
  questionnaire: { findMany: jest.fn() },
  accessReview: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));

import { buildExtraIndex } from './search-extra';

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.asset.findMany.mockResolvedValue([
    { id: 'ast_1', name: 'prod-db', type: 'database', environment: 'production', externalId: 'i-1' },
  ]);
  mockDb.integrationPlatformFinding.findMany.mockResolvedValue([
    { id: 'ipf_1', title: 'OpenSSL CVE', severity: 'high', status: 'open', cveId: 'CVE-2024-1' },
  ]);
  mockDb.finding.findMany.mockResolvedValue([
    { id: 'fnd_1', content: 'Backups not tested\nmore detail', severity: 'major', status: 'open' },
  ]);
  mockDb.auditEngagement.findMany.mockResolvedValue([
    { id: 'aud_1', title: 'ISO 27001 Stage 2', status: 'in_progress', firmName: 'Acme' },
  ]);
  mockDb.questionnaire.findMany.mockResolvedValue([
    { id: 'qst_1', filename: 'sig-lite.xlsx', status: 'completed' },
  ]);
  mockDb.accessReview.findMany.mockResolvedValue([
    { id: 'arv_1', name: 'Q4 AWS review', status: 'in_progress' },
  ]);
});

describe('buildExtraIndex', () => {
  it('indexes assets, open vulnerabilities, findings, audits, questionnaires and access reviews for the org', async () => {
    const entries = await buildExtraIndex({ organizationId: 'org_1', can: () => true });

    expect(entries.map((e) => e.type)).toEqual([
      'asset',
      'vulnerability',
      'finding',
      'audit',
      'questionnaire',
      'access_review',
    ]);
    expect(entries.find((e) => e.type === 'finding')?.label).toBe('Backups not tested');
    expect(entries.find((e) => e.type === 'vulnerability')?.keywords).toEqual(['CVE-2024-1']);
    for (const model of Object.values(mockDb)) {
      expect(model.findMany.mock.calls[0][0].where.organizationId).toBe('org_1');
    }
    expect(mockDb.integrationPlatformFinding.findMany.mock.calls[0][0].where.status).toEqual({
      not: 'resolved',
    });
  });

  it('only queries the types the caller may read', async () => {
    const granted = new Set(['audit:read', 'questionnaire:read']);
    const entries = await buildExtraIndex({
      organizationId: 'org_1',
      can: (resource, action) => granted.has(`${resource}:${action}`),
    });

    expect(entries.map((e) => e.type)).toEqual(['audit', 'questionnaire']);
    expect(mockDb.asset.findMany).not.toHaveBeenCalled();
    expect(mockDb.integrationPlatformFinding.findMany).not.toHaveBeenCalled();
    expect(mockDb.finding.findMany).not.toHaveBeenCalled();
    expect(mockDb.accessReview.findMany).not.toHaveBeenCalled();
  });
});
