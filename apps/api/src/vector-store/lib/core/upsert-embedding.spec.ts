const mockUpsert = jest.fn().mockResolvedValue('Success');
jest.mock('./client', () => ({
  vectorIndex: { upsert: (...args: unknown[]) => mockUpsert(...args) },
}));
jest.mock('./generate-embedding', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2]),
}));

import { batchUpsertEmbeddings, upsertEmbedding } from './upsert-embedding';

const longText = `Question: How is access controlled?\n\nAnswer: ${'x'.repeat(3000)} END`;
const metadata = {
  organizationId: 'org_1',
  sourceType: 'context' as const,
  sourceId: 'ctx_1',
  content: '',
  contextQuestion: 'How is access controlled?',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('upsert-embedding stores the whole chunk text', () => {
  it('upsertEmbedding keeps text past 1000 characters', async () => {
    await upsertEmbedding('ctx_1_chunk0', longText, metadata);

    expect(mockUpsert.mock.calls[0]![0].metadata.content).toBe(longText);
  });

  it('batchUpsertEmbeddings keeps text past 1000 characters', async () => {
    await batchUpsertEmbeddings([
      { id: 'ctx_1_chunk0', text: longText, metadata },
    ]);

    expect(mockUpsert.mock.calls[0]![0].metadata.content).toBe(longText);
  });
});
