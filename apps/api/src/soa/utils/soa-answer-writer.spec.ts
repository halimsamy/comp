import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  sOADocument: { findFirst: jest.fn() },
  sOAAnswer: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
  vendor: { findFirst: jest.fn() },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('./soa-storage', () => ({
  countAnsweredAnswers: jest.fn().mockResolvedValue(1),
  updateDocumentAnsweredCount: jest.fn(),
}));
jest.mock('./soa-applicability-sync', () => ({ syncSoaApplicability: jest.fn() }));

import { syncSoaApplicability } from './soa-applicability-sync';
import { writeSoaAnswer, writeSoaAnswerForAnnexA } from './soa-answer-writer';

const logger = { log: jest.fn(), error: jest.fn() };
const questions = [
  { id: 'q-74', columnMapping: { closure: '7.4' } },
  { id: 'q-515', columnMapping: { closure: '5.15' } },
];
const document = { id: 'doc_1', totalQuestions: 2, configuration: { questions } };

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.sOADocument.findFirst.mockResolvedValue(document);
  mockDb.sOAAnswer.findFirst.mockResolvedValue(null);
});

describe('writeSoaAnswerForAnnexA (requirement page -> SoA)', () => {
  it('writes the matching SoA row and syncs applicability', async () => {
    await writeSoaAnswerForAnnexA({
      organizationId: 'org_1',
      frameworkId: 'frk_iso',
      identifier: 'A.7.4',
      isApplicable: false,
      justification: 'Fully remote, no offices',
      userId: 'usr_1',
      logger,
    });
    expect(mockDb.sOADocument.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      frameworkId: 'frk_iso',
      isLatest: true,
    });
    expect(mockDb.sOAAnswer.create.mock.calls[0][0].data).toMatchObject({
      documentId: 'doc_1',
      questionId: 'q-74',
      isApplicable: false,
      answer: 'Fully remote, no offices',
      isLatestAnswer: true,
    });
    expect(syncSoaApplicability).toHaveBeenCalledWith({ documentId: 'doc_1', logger });
  });

  it('asks to set up the SoA when there is no document', async () => {
    mockDb.sOADocument.findFirst.mockResolvedValue(null);
    await expect(
      writeSoaAnswerForAnnexA({
        organizationId: 'org_1',
        frameworkId: 'frk_iso',
        identifier: 'A.7.4',
        isApplicable: true,
        justification: null,
        userId: 'usr_1',
        logger,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('writeSoaAnswer', () => {
  const base = { organizationId: 'org_1', documentId: 'doc_1', userId: 'usr_1', logger };

  it('keeps the previous decision on a partial edit and retires the old version', async () => {
    mockDb.sOAAnswer.findFirst.mockResolvedValue({
      id: 'ans_1',
      answerVersion: 2,
      isApplicable: true,
      answer: 'old',
      inheritedVendorId: 'vnd_1',
    });
    await writeSoaAnswer({ ...base, questionId: 'q-515', justification: 'new' });
    expect(mockDb.sOAAnswer.update).toHaveBeenCalledWith({
      where: { id: 'ans_1' },
      data: { isLatestAnswer: false },
    });
    expect(mockDb.sOAAnswer.create.mock.calls[0][0].data).toMatchObject({
      isApplicable: true,
      answer: 'new',
      inheritedVendorId: 'vnd_1',
      answerVersion: 3,
    });
  });

  it('records an inherited supplier from the same organization', async () => {
    mockDb.vendor.findFirst.mockResolvedValue({ id: 'vnd_aws' });
    await writeSoaAnswer({
      ...base,
      questionId: 'q-74',
      isApplicable: true,
      inheritedVendorId: 'vnd_aws',
    });
    expect(mockDb.vendor.findFirst.mock.calls[0][0].where).toEqual({
      id: 'vnd_aws',
      organizationId: 'org_1',
    });
    expect(mockDb.sOAAnswer.create.mock.calls[0][0].data.inheritedVendorId).toBe('vnd_aws');
  });

  it('rejects a supplier from another organization', async () => {
    mockDb.vendor.findFirst.mockResolvedValue(null);
    await expect(
      writeSoaAnswer({ ...base, questionId: 'q-74', isApplicable: true, inheritedVendorId: 'vnd_x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('drops the supplier when the control becomes not applicable', async () => {
    await writeSoaAnswer({
      ...base,
      questionId: 'q-74',
      isApplicable: false,
      justification: 'No offices',
      inheritedVendorId: 'vnd_aws',
    });
    expect(mockDb.sOAAnswer.create.mock.calls[0][0].data.inheritedVendorId).toBeNull();
  });

  it('requires a justification for not applicable', async () => {
    await expect(
      writeSoaAnswer({ ...base, questionId: 'q-74', isApplicable: false, justification: ' ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDb.sOAAnswer.create).not.toHaveBeenCalled();
  });

  it('rejects questions outside the document', async () => {
    await expect(
      writeSoaAnswer({ ...base, questionId: 'q-nope', isApplicable: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
