import { isPhysicalSecurityControl } from './soa-answer-parser';

interface OpenRowQuestion {
  id: string;
  columnMapping?: { closure?: string | null; title?: string | null } | null;
}

/**
 * SoA rows with no applicability decision yet. A fully remote org's
 * unanswered physical (7.x) rows count as decided: they default to N/A on
 * screen and in the export.
 */
export function listUndecidedRows({
  questions,
  answers,
  isFullyRemote,
}: {
  questions: OpenRowQuestion[];
  answers: { questionId: string; isApplicable: boolean | null }[];
  isFullyRemote: boolean;
}): { questionId: string; code: string; title: string }[] {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return questions.flatMap((question) => {
    const closure = question.columnMapping?.closure ?? '';
    const answer = byId.get(question.id);
    if (answer && answer.isApplicable !== null) return [];
    if (!answer && isFullyRemote && isPhysicalSecurityControl(closure)) return [];
    return [
      {
        questionId: question.id,
        code: closure ? `A.${closure}` : question.id,
        title: question.columnMapping?.title ?? '',
      },
    ];
  });
}

/** "A.5.1, A.5.2, A.5.3 and 4 more" */
export function summarizeCodes(codes: string[], max = 8): string {
  if (codes.length <= max) return codes.join(', ');
  return `${codes.slice(0, max).join(', ')} and ${codes.length - max} more`;
}
