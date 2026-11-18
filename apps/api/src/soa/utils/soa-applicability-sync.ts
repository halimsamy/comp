import { db } from '@db';
import { loadRequirementDefinitions } from '../../frameworks/frameworks-requirements.helper';
import { FULLY_REMOTE_JUSTIFICATION } from './constants';
import { isPhysicalSecurityControl } from './soa-answer-parser';
import { checkIfFullyRemote, type SOAStorageLogger } from './soa-storage';

interface SoaQuestionConfig {
  id: string;
  columnMapping?: { closure?: string | null } | null;
}

/**
 * ISO 27001 6.1.3 d): the Statement of Applicability decides which Annex A
 * controls apply. Writes the latest SoA document's answers into
 * RequirementApplicability for the org's ISO instance (Annex A "A.<closure>"),
 * so framework scoring and the requirement pages match the SoA.
 */
export async function syncSoaApplicability({
  documentId,
  logger,
}: {
  documentId: string;
  logger: SOAStorageLogger;
}): Promise<number> {
  const document = await db.sOADocument.findFirst({
    where: { id: documentId, isLatest: true },
    select: {
      organizationId: true,
      frameworkId: true,
      configuration: { select: { questions: true } },
      answers: {
        where: { isLatestAnswer: true },
        select: { questionId: true, isApplicable: true, answer: true },
      },
    },
  });
  if (!document) return 0;
  const { organizationId } = document;

  const instance = await db.frameworkInstance.findFirst({
    where: { organizationId, frameworkId: document.frameworkId },
    select: { id: true, frameworkId: true, customFrameworkId: true, currentVersionId: true },
  });
  if (!instance) return 0;

  const [requirements, isFullyRemote] = await Promise.all([
    loadRequirementDefinitions(instance),
    checkIfFullyRemote(organizationId, logger),
  ]);
  const requirementIdByIdentifier = new Map(requirements.map((r) => [r.identifier, r.id]));
  const answers = new Map(document.answers.map((a) => [a.questionId, a]));
  const questions = (document.configuration.questions as unknown as SoaQuestionConfig[]) ?? [];

  const rows = questions.flatMap((question) => {
    const closure = question.columnMapping?.closure ?? '';
    const requirementKey = requirementIdByIdentifier.get(`A.${closure}`);
    if (!closure || !requirementKey) return [];
    const answer = answers.get(question.id);
    // Same remote default as the SoA screen and export: unanswered physical controls are N/A.
    const remoteDefault = !answer && isFullyRemote && isPhysicalSecurityControl(closure);
    const isApplicable = remoteDefault ? false : (answer?.isApplicable ?? null);
    if (isApplicable === null) return [];
    return [
      {
        organizationId,
        frameworkInstanceId: instance.id,
        requirementKey,
        status: isApplicable ? ('applicable' as const) : ('not_applicable' as const),
        justification: remoteDefault ? FULLY_REMOTE_JUSTIFICATION : (answer?.answer ?? null),
        source: 'soa' as const,
      },
    ];
  });
  if (rows.length === 0) return 0;

  await db.$transaction([
    db.requirementApplicability.deleteMany({
      where: {
        organizationId,
        frameworkInstanceId: instance.id,
        requirementKey: { in: rows.map((r) => r.requirementKey) },
      },
    }),
    db.requirementApplicability.createMany({ data: rows }),
  ]);
  return rows.length;
}
