jest.mock('@db', () => ({
  db: {},
  Departments: {},
  RiskCategory: {},
  RiskStatus: {},
}));
jest.mock('../vector-store/lib', () => ({
  findSimilarContent: jest.fn(),
}));

import { findSimilarContent } from '../vector-store/lib';
import { buildTools } from './assistant-chat-tools';

const mockSearch = findSimilarContent as jest.Mock;

const makeTools = (permissions: Record<string, string[]>) =>
  buildTools({ organizationId: 'org_1', userId: 'usr_1', permissions });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('searchOrganizationKnowledge', () => {
  it('is not offered without read access to any knowledge source', () => {
    expect(
      makeTools({ risk: ['read'] }).searchOrganizationKnowledge,
    ).toBeUndefined();
  });

  it('searches every knowledge source for an admin and labels each result', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'v1',
        score: 0.81,
        content: 'We run on AWS in eu-west-1.',
        sourceType: 'context',
        sourceId: 'ctx_1',
        contextQuestion: 'Where do you host your applications?',
      },
      {
        id: 'v2',
        score: 0.7,
        content: 'Access is reviewed quarterly.',
        sourceType: 'policy',
        sourceId: 'pol_1',
        policyName: 'Access Control Policy',
      },
    ]);
    const tools = makeTools({
      evidence: ['read'],
      policy: ['read'],
      questionnaire: ['read'],
    });

    const result = await tools.searchOrganizationKnowledge.execute({
      query: 'where is data hosted?',
    });

    expect(mockSearch).toHaveBeenCalledWith('where is data hosted?', 'org_1', {
      sourceTypes: expect.arrayContaining([
        'context',
        'policy',
        'manual_answer',
        'knowledge_base_document',
      ]),
    });
    expect(result).toEqual({
      results: [
        {
          source: 'context',
          title: 'Where do you host your applications?',
          content: 'We run on AWS in eu-west-1.',
          relevance: 0.81,
        },
        {
          source: 'policy',
          title: 'Access Control Policy',
          content: 'Access is reviewed quarterly.',
          relevance: 0.7,
        },
      ],
    });
  });

  it('only searches the sources the user may read', async () => {
    mockSearch.mockResolvedValue([]);
    const tools = makeTools({ evidence: ['read'] });

    const result = await tools.searchOrganizationKnowledge.execute({
      query: 'backups',
    });

    const { sourceTypes } = mockSearch.mock.calls[0]![2];
    expect(sourceTypes).toContain('context');
    expect(sourceTypes).not.toContain('policy');
    expect(sourceTypes).not.toContain('manual_answer');
    expect(result).toEqual({
      results: [],
      message: 'No matching organization knowledge found',
    });
  });
});
