jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  tags: { add: jest.fn() },
  task: (config: unknown) => config,
}));

const mockDeleteWhere = jest.fn();
const mockList = jest.fn();
jest.mock('@/vector-store/lib/core/client', () => ({
  vectorIndex: {
    deleteWhere: (...args: unknown[]) => mockDeleteWhere(...args),
    list: (...args: unknown[]) => mockList(...args),
  },
}));

import { deleteKnowledgeBaseDocumentTask } from './delete-knowledge-base-document';

const task = deleteKnowledgeBaseDocumentTask as unknown as {
  run: (payload: { documentId: string; organizationId: string }) => Promise<unknown>;
};
const payload = { documentId: 'kbd_1', organizationId: 'org_1' };
const filter = {
  organizationId: 'org_1',
  sourceType: 'knowledge_base_document',
  sourceId: 'kbd_1',
};

describe('delete-knowledge-base-document-from-vector', () => {
  beforeEach(() => {
    mockDeleteWhere.mockReset();
    mockList.mockReset();
  });

  it('deletes every chunk of the document by exact filter and verifies none remain', async () => {
    mockDeleteWhere.mockResolvedValue({ deleted: 250 });
    mockList.mockResolvedValue([]);

    await expect(task.run(payload)).resolves.toEqual({
      success: true,
      documentId: 'kbd_1',
      deletedCount: 250,
    });
    expect(mockDeleteWhere).toHaveBeenCalledWith(filter);
    expect(mockList).toHaveBeenCalledWith(filter);
  });

  it('throws so the job retries when chunks remain', async () => {
    mockDeleteWhere.mockResolvedValue({ deleted: 1 });
    mockList.mockResolvedValue([{ id: 'left', score: 1 }]);

    await expect(task.run(payload)).rejects.toThrow('1 embeddings remain');
  });
});
