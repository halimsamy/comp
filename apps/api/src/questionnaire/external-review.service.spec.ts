import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockTrustFindUnique = jest.fn();
const mockGrantFindUnique = jest.fn();
const mockMemberFindMany = jest.fn();
const mockQuestionnaireFindFirst = jest.fn();
const mockQuestionnaireUpdate = jest.fn();
jest.mock('@db', () => ({
  db: {
    trust: { findUnique: (...a: unknown[]) => mockTrustFindUnique(...a) },
    trustAccessGrant: { findUnique: (...a: unknown[]) => mockGrantFindUnique(...a) },
    member: { findMany: (...a: unknown[]) => mockMemberFindMany(...a) },
    questionnaire: {
      findFirst: (...a: unknown[]) => mockQuestionnaireFindFirst(...a),
      update: (...a: unknown[]) => mockQuestionnaireUpdate(...a),
    },
  },
}));
const mockTriggerEmail = jest.fn().mockResolvedValue({ id: 'e1' });
jest.mock('../email/trigger-email', () => ({
  triggerEmail: (...a: unknown[]) => mockTriggerEmail(...a),
}));
jest.mock('../email/templates/questionnaire-review', () => ({
  QuestionnaireReviewEmail: () => null,
}));
jest.mock('./utils/export-generator', () => ({
  generateExportFile: jest.fn(async (_qa: unknown, format: string, name: string) => ({
    fileBuffer: Buffer.from(format),
    mimeType: 'x',
    filename: `${name}.${format}`,
  })),
}));

import { ExternalQuestionnaireReviewService } from './external-review.service';

describe('ExternalQuestionnaireReviewService', () => {
  const service = new ExternalQuestionnaireReviewService();
  beforeEach(() => jest.clearAllMocks());

  it('requires review by default', async () => {
    mockTrustFindUnique.mockResolvedValue(null);
    expect(await service.requiresReview('org_1')).toBe(true);
    mockTrustFindUnique.mockResolvedValue({ securityQuestionnaireRequiresReview: false });
    expect(await service.requiresReview('org_1')).toBe(false);
  });

  it('reads the requester email from the access grant', async () => {
    mockGrantFindUnique.mockResolvedValue({ subjectEmail: 'buyer@x.com' });
    expect(await service.getRequesterEmail('tok')).toBe('buyer@x.com');
    mockGrantFindUnique.mockResolvedValue(null);
    await expect(service.getRequesterEmail('bad')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emails owners and admins of the org', async () => {
    mockMemberFindMany.mockResolvedValue([{ user: { email: 'owner@x.com' } }]);
    await service.notifyReviewers({ organizationId: 'org_1', requesterEmail: 'buyer@x.com' });
    expect(mockMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org_1' }) }),
    );
    expect(mockTriggerEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@x.com' }));
  });

  it('approves a pending questionnaire and emails the answers as a ZIP', async () => {
    mockQuestionnaireFindFirst.mockResolvedValue({
      filename: 'sig.xlsx',
      reviewStatus: 'pending_review',
      requesterEmail: 'buyer@x.com',
      organization: { name: 'Spare' },
      questions: [{ question: 'MFA?', answer: 'Yes' }],
    });
    mockQuestionnaireUpdate.mockResolvedValue({ id: 'qst_1', reviewStatus: 'approved' });
    await service.approve({ organizationId: 'org_1', questionnaireId: 'qst_1', userId: 'usr_1' });
    expect(mockQuestionnaireFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'qst_1', organizationId: 'org_1' } }),
    );
    const email = mockTriggerEmail.mock.calls[0][0];
    expect(email.to).toBe('buyer@x.com');
    expect(email.attachments[0].filename).toBe('sig-answers.zip');
    expect(mockQuestionnaireUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewStatus: 'approved', reviewedByUserId: 'usr_1' }),
      }),
    );
  });

  it('keeps the questionnaire pending when the email cannot be sent', async () => {
    mockQuestionnaireFindFirst.mockResolvedValue({
      filename: 'sig.xlsx',
      reviewStatus: 'pending_review',
      requesterEmail: 'buyer@x.com',
      organization: { name: 'Spare' },
      questions: [],
    });
    mockQuestionnaireUpdate.mockClear();
    mockTriggerEmail.mockRejectedValueOnce(new Error('render failed'));
    await expect(
      service.approve({ organizationId: 'org_1', questionnaireId: 'qst_1', userId: 'usr_1' }),
    ).rejects.toThrow('Email could not be sent, try again');
    expect(mockQuestionnaireUpdate).not.toHaveBeenCalled();
  });

  it('refuses questionnaires that are not waiting for review', async () => {
    mockQuestionnaireFindFirst.mockResolvedValue({
      filename: 'a',
      reviewStatus: 'approved',
      requesterEmail: 'b@x.com',
      organization: { name: 'S' },
      questions: [],
    });
    await expect(
      service.approve({ organizationId: 'org_1', questionnaireId: 'qst_1', userId: 'usr_1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    mockQuestionnaireFindFirst.mockResolvedValue(null);
    await expect(
      service.approve({ organizationId: 'org_2', questionnaireId: 'qst_1', userId: 'usr_1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
