import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { syncSoaApplicability } from './soa-applicability-sync';
import {
  countAnsweredAnswers,
  updateDocumentAnsweredCount,
  type SOAStorageLogger,
} from './soa-storage';

interface ConfigQuestion {
  id: string;
  columnMapping?: { closure?: string | null } | null;
}

/**
 * Writes one SoA answer as a new version, refreshes the answered count and
 * syncs ISO requirement applicability. Omitted fields keep their previous
 * value, so a partial edit can't wipe an earlier decision.
 */
export async function writeSoaAnswer({
  organizationId,
  documentId,
  questionId,
  isApplicable: nextIsApplicable,
  justification: nextJustification,
  inheritedVendorId: nextVendorId,
  userId,
  logger,
}: {
  organizationId: string;
  documentId: string;
  questionId: string;
  isApplicable?: boolean | null;
  justification?: string | null;
  inheritedVendorId?: string | null;
  userId: string;
  logger: SOAStorageLogger;
}) {
  const document = await db.sOADocument.findFirst({
    where: { id: documentId, organizationId },
    include: { configuration: true },
  });
  if (!document) throw new NotFoundException('SOA document not found');

  // The question must belong to this document's configuration.
  const configQuestions = (document.configuration.questions as unknown as ConfigQuestion[]) ?? [];
  if (!configQuestions.some((q) => q.id === questionId)) {
    throw new BadRequestException('Question does not belong to this SOA document');
  }

  const existingAnswer = await db.sOAAnswer.findFirst({
    where: { documentId, questionId, isLatestAnswer: true },
    orderBy: { answerVersion: 'desc' },
  });

  const isApplicable =
    nextIsApplicable === undefined ? (existingAnswer?.isApplicable ?? null) : nextIsApplicable;
  const justification =
    nextJustification === undefined ? (existingAnswer?.answer ?? null) : nextJustification;
  // Inherited from a supplier only makes sense for an applicable control.
  const requestedVendorId =
    nextVendorId === undefined ? (existingAnswer?.inheritedVendorId ?? null) : nextVendorId;
  const inheritedVendorId = isApplicable === true ? requestedVendorId : null;

  // ISO 27001 6.1.3 d): a not-applicable control must carry a justification.
  if (isApplicable === false && (!justification || justification.trim().length === 0)) {
    throw new BadRequestException('A justification is required when a control is not applicable');
  }
  if (inheritedVendorId && nextVendorId !== undefined) {
    const vendor = await db.vendor.findFirst({
      where: { id: inheritedVendorId, organizationId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
  }

  const isAnswered = isApplicable !== null;
  await db.$transaction([
    ...(existingAnswer
      ? [db.sOAAnswer.update({ where: { id: existingAnswer.id }, data: { isLatestAnswer: false } })]
      : []),
    db.sOAAnswer.create({
      data: {
        documentId,
        questionId,
        answer: justification,
        isApplicable,
        inheritedVendorId,
        status: isAnswered || (justification && justification.trim().length > 0) ? 'manual' : 'untouched',
        answerVersion: existingAnswer ? existingAnswer.answerVersion + 1 : 1,
        isLatestAnswer: true,
        createdBy: existingAnswer ? undefined : userId,
        updatedBy: userId,
      },
    }),
  ]);

  const answeredCount = await countAnsweredAnswers(
    documentId,
    configQuestions.map((q) => q.id),
  );
  await updateDocumentAnsweredCount(documentId, document.totalQuestions, answeredCount);

  try {
    await syncSoaApplicability({ documentId, logger });
  } catch (error) {
    logger.error('Failed to sync SoA applicability', { documentId, error: String(error) });
  }
  return { success: true };
}

/**
 * ISO 27001 Annex A: the SoA is the source of truth, so a change made on the
 * requirement page is written to the latest SoA document's matching row.
 */
export async function writeSoaAnswerForAnnexA({
  organizationId,
  frameworkId,
  identifier,
  isApplicable,
  justification,
  userId,
  logger,
}: {
  organizationId: string;
  frameworkId: string;
  identifier: string;
  isApplicable: boolean;
  justification: string | null;
  userId: string;
  logger: SOAStorageLogger;
}) {
  const document = await db.sOADocument.findFirst({
    where: { organizationId, frameworkId, isLatest: true },
    select: { id: true, configuration: { select: { questions: true } } },
  });
  if (!document) {
    throw new BadRequestException(
      'Open the Statement of Applicability once to set it up, then try again.',
    );
  }
  const closure = identifier.replace(/^A\./, '');
  const questions = (document.configuration.questions as unknown as ConfigQuestion[]) ?? [];
  const question = questions.find((q) => q.columnMapping?.closure === closure);
  if (!question) throw new NotFoundException(`No Statement of Applicability row for ${identifier}`);

  return writeSoaAnswer({
    organizationId,
    documentId: document.id,
    questionId: question.id,
    isApplicable,
    justification,
    userId,
    logger,
  });
}
