const mockDb = {
  organization: { findUnique: jest.fn() },
  risk: { findMany: jest.fn() },
  vendor: { findMany: jest.fn() },
  device: { groupBy: jest.fn() },
  integrationConnection: { findMany: jest.fn() },
  context: { findMany: jest.fn() },
};
const mockGenerateObject = jest.fn();
jest.mock('@db', () => ({ ...jest.requireActual('@prisma/client'), db: mockDb }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(() => 'model') }));
jest.mock('ai', () => ({ generateObject: (...args: unknown[]) => mockGenerateObject(...args) }));

import { ServiceUnavailableException } from '@nestjs/common';
import { RiskSuggestionsService } from './risk-suggestions.service';

const ORG = 'org_1';

describe('RiskSuggestionsService', () => {
  const service = new RiskSuggestionsService();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.organization.findUnique.mockResolvedValue({ name: 'Acme Pay', website: 'acme.test' });
    mockDb.risk.findMany.mockResolvedValue([{ title: 'Existing risk' }]);
    mockDb.vendor.findMany.mockResolvedValue([
      { name: 'Stripe', category: 'finance', description: 'Card processing' },
    ]);
    mockDb.device.groupBy.mockResolvedValue([{ platform: 'macos', _count: 12 }]);
    mockDb.integrationConnection.findMany.mockResolvedValue([
      { provider: { name: 'AWS', category: 'cloud' } },
    ]);
    mockDb.context.findMany.mockResolvedValue([{ question: 'Stores PAN?', answer: 'No' }]);
  });

  it('grounds the prompt in org-scoped vendors, assets, integrations and existing risks', async () => {
    const suggestion = {
      title: 'Processor outage',
      description: 'Stripe outage stops card acceptance.',
      category: 'vendor_management',
      likelihood: 'possible',
      impact: 'major',
      treatmentStrategyDescription: 'Add a fallback processor.',
      source: 'Vendor: Stripe',
    };
    mockGenerateObject.mockResolvedValue({ object: { suggestions: [suggestion] } });

    await expect(service.suggest(ORG)).resolves.toEqual([suggestion]);

    for (const query of [mockDb.risk, mockDb.vendor, mockDb.integrationConnection, mockDb.context]) {
      expect(query.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
    }
    expect(mockDb.device.groupBy.mock.calls[0][0].where).toEqual({ organizationId: ORG });
    const { prompt } = mockGenerateObject.mock.calls[0][0];
    expect(prompt).toContain('Stripe');
    expect(prompt).toContain('macos: 12');
    expect(prompt).toContain('AWS');
    expect(prompt).toContain('- Existing risk');
  });

  it('turns an AI failure into a retryable 503', async () => {
    mockGenerateObject.mockRejectedValue(new Error('rate limited'));
    await expect(service.suggest(ORG)).rejects.toThrow(ServiceUnavailableException);
  });
});
