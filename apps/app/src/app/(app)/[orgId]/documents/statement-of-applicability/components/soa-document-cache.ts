import type { SOATableAnswerData } from './soa-field-types';

type CachedDocument = Record<string, unknown>;

/**
 * Optimistic SWR update after answers change: new counts, completion status,
 * and any approval cleared (an edit voids the previous approval).
 */
export function withAnsweredCount<T extends CachedDocument>(
  current: T | null | undefined,
  { total, answered }: { total?: number; answered?: number | ((current: number) => number) },
): T | null | undefined {
  if (!current) return current;
  const totalQuestions = typeof total === 'number' ? total : current.totalQuestions;
  const previous = current.answeredQuestions;
  if (typeof totalQuestions !== 'number' || typeof previous !== 'number') return current;
  const next =
    typeof answered === 'function' ? answered(previous) : typeof answered === 'number' ? answered : previous;
  const answeredQuestions = Math.max(0, Math.min(totalQuestions, next));
  return {
    ...current,
    totalQuestions,
    answeredQuestions,
    status: answeredQuestions === totalQuestions ? 'completed' : 'in_progress',
    approverId: null,
    approvedAt: null,
    declinedAt: null,
  };
}

type SOAAnswerRecord = {
  questionId: string;
  answer: string | null;
  isApplicable: boolean | null;
  answerVersion: number;
  inheritedVendorId?: string | null;
};

// Map a persisted answer to row state. `isApplicable` carries the persisted
// value; `savedIsApplicable` is deliberately left unset here — it is reserved
// for a manual save this session (set in handleAnswerUpdate) so it doesn't
// shadow in-session autofill results in resolveSoaDisplay.
function toAnswerData(answer: SOAAnswerRecord): SOATableAnswerData {
  return {
    answer: answer.answer,
    answerVersion: answer.answerVersion,
    isApplicable: answer.isApplicable,
    inheritedVendorId: answer.inheritedVendorId ?? null,
  };
}

export function toAnswersMap(answers: SOAAnswerRecord[] | undefined): Map<string, SOATableAnswerData> {
  return new Map((answers ?? []).map((answer) => [answer.questionId, toAnswerData(answer)]));
}

