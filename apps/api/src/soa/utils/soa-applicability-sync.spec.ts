const mockDb = {
  sOADocument: { findFirst: jest.fn() },
  frameworkInstance: { findFirst: jest.fn() },
  requirementApplicability: { deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../../frameworks/frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: jest.fn().mockResolvedValue([
    { id: 'rq_a51', identifier: 'A.5.1' },
    { id: 'rq_a74', identifier: 'A.7.4' },
    { id: 'rq_a81', identifier: 'A.8.1' },
    { id: 'rq_c51', identifier: '5.1' },
  ]),
}));
jest.mock('./soa-storage', () => ({ checkIfFullyRemote: jest.fn() }));

import { checkIfFullyRemote } from './soa-storage';
import { syncSoaApplicability } from './soa-applicability-sync';
import { FULLY_REMOTE_JUSTIFICATION } from './constants';

const logger = { log: jest.fn(), error: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.sOADocument.findFirst.mockResolvedValue({
    organizationId: 'org_1',
    frameworkId: 'frk_iso',
    configuration: {
      questions: [
        { id: 'q1', columnMapping: { closure: '5.1' } },
        { id: 'q2', columnMapping: { closure: '7.4' } },
        { id: 'q3', columnMapping: { closure: '8.1' } },
      ],
    },
    answers: [
      { questionId: 'q1', isApplicable: true, answer: 'Needed for governance' },
      { questionId: 'q3', isApplicable: false, answer: 'No endpoints' },
    ],
  });
  mockDb.frameworkInstance.findFirst.mockResolvedValue({
    id: 'fi_iso',
    frameworkId: 'frk_iso',
    customFrameworkId: null,
    currentVersionId: null,
  });
  (checkIfFullyRemote as jest.Mock).mockResolvedValue(false);
});

describe('syncSoaApplicability', () => {
  it('writes Annex A answers (not clause 5.1) for the org ISO instance', async () => {
    const count = await syncSoaApplicability({ documentId: 'doc_1', logger });

    expect(count).toBe(2);
    expect(mockDb.frameworkInstance.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      frameworkId: 'frk_iso',
    });
    expect(mockDb.requirementApplicability.deleteMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      frameworkInstanceId: 'fi_iso',
      requirementKey: { in: ['rq_a51', 'rq_a81'] },
    });
    expect(mockDb.requirementApplicability.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ requirementKey: 'rq_a51', status: 'applicable', source: 'soa' }),
      expect.objectContaining({
        requirementKey: 'rq_a81',
        status: 'not_applicable',
        justification: 'No endpoints',
      }),
    ]);
  });

  it('applies the fully remote default to unanswered physical controls', async () => {
    (checkIfFullyRemote as jest.Mock).mockResolvedValue(true);
    await syncSoaApplicability({ documentId: 'doc_1', logger });
    expect(mockDb.requirementApplicability.createMany.mock.calls[0][0].data).toContainEqual(
      expect.objectContaining({
        requirementKey: 'rq_a74',
        status: 'not_applicable',
        justification: FULLY_REMOTE_JUSTIFICATION,
      }),
    );
  });

  it('does nothing without an ISO instance', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(null);
    expect(await syncSoaApplicability({ documentId: 'doc_1', logger })).toBe(0);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});
