import { describe, expect, it } from 'vitest';
import { FULLY_REMOTE_JUSTIFICATION, listUndecidedCodes, resolveSoaDisplay } from './soa-display';

describe('resolveSoaDisplay', () => {
  const base = { isFullyRemote: false, isControl7: false };

  it('uses the persisted per-organization answer', () => {
    // The only source of applicability/justification is this org's own answer.
    // (There is deliberately no shared-configuration input to bleed from.)
    const result = resolveSoaDisplay({
      ...base,
      answerData: {
        answer: 'Our own justification',
        answerVersion: 1,
        isApplicable: false,
      },
    });

    expect(result).toEqual({
      displayIsApplicable: false,
      justificationValue: 'Our own justification',
    });
  });

  it('shows not decided (never applicable) when there is no answer at all', () => {
    const result = resolveSoaDisplay({ ...base, answerData: undefined });

    expect(result).toEqual({
      displayIsApplicable: null,
      justificationValue: null,
    });
  });

  it('shows unanswered (N/A) for an answer whose applicability is unknown, without assuming applicable', () => {
    // Pre-migration answers have a justification but no applicability value.
    // These must not silently render as "applicable"; they read as N/A,
    // consistent with the export, until the org re-runs auto-fill.
    const result = resolveSoaDisplay({
      ...base,
      answerData: {
        answer: 'Existing justification',
        answerVersion: 1,
        isApplicable: null,
      },
    });

    expect(result).toEqual({
      displayIsApplicable: null,
      justificationValue: 'Existing justification',
    });
  });

  it('lets an in-session autofill result override a stale persisted answer', () => {
    const result = resolveSoaDisplay({
      ...base,
      answerData: {
        answer: 'Old persisted justification',
        answerVersion: 1,
        isApplicable: true,
      },
      processedResult: {
        success: true,
        isApplicable: false,
        justification: 'Fresh autofill justification',
      },
    });

    expect(result).toEqual({
      displayIsApplicable: false,
      justificationValue: 'Fresh autofill justification',
    });
  });

  it('lets a manual save this session win over an in-flight autofill result', () => {
    const result = resolveSoaDisplay({
      ...base,
      answerData: {
        answer: 'Manually saved justification',
        answerVersion: 2,
        savedIsApplicable: true,
      },
      processedResult: {
        success: true,
        isApplicable: false,
        justification: 'Autofill justification',
      },
    });

    expect(result).toEqual({
      displayIsApplicable: true,
      justificationValue: 'Manually saved justification',
    });
  });

  it("keeps a fully remote org's saved answer on physical-security (7.x) controls so they stay editable", () => {
    // Regression (CS-749): a fully remote org must be able to mark a 7.x control
    // Applicable. The saved answer wins instead of being force-locked to Not
    // Applicable — the org can move to a physical office at any time.
    const result = resolveSoaDisplay({
      isFullyRemote: true,
      isControl7: true,
      answerData: {
        answer: 'We maintain physical access controls at our office',
        answerVersion: 1,
        isApplicable: true,
      },
    });

    expect(result).toEqual({
      displayIsApplicable: true,
      justificationValue: 'We maintain physical access controls at our office',
    });
  });

  it('defaults a fully remote org to Not Applicable on physical-security (7.x) controls only when there is no saved answer', () => {
    const result = resolveSoaDisplay({
      isFullyRemote: true,
      isControl7: true,
      answerData: undefined,
    });

    expect(result).toEqual({
      displayIsApplicable: false,
      justificationValue: FULLY_REMOTE_JUSTIFICATION,
    });
  });
});

describe('listUndecidedCodes', () => {
  const questions = [
    { id: 'q1', columnMapping: { closure: '5.1' } },
    { id: 'q2', columnMapping: { closure: '5.2' } },
    { id: 'q3', columnMapping: { closure: '7.4' } },
    { id: 'q4', columnMapping: { closure: '8.1' } },
  ];

  it('lists rows without a decision as Annex A codes', () => {
    const answersMap = new Map([
      ['q1', { answer: 'Yes', answerVersion: 1, isApplicable: true }],
      ['q2', { answer: 'Legacy', answerVersion: 1, isApplicable: null }],
    ]);
    const processedResults = new Map([['q4', { success: true, isApplicable: false }]]);
    expect(
      listUndecidedCodes({ questions, answersMap, processedResults, isFullyRemote: false }),
    ).toEqual(['A.5.2', 'A.7.4']);
  });

  it('treats a remote org’s unanswered physical controls as decided', () => {
    expect(
      listUndecidedCodes({
        questions,
        answersMap: new Map(),
        processedResults: new Map(),
        isFullyRemote: true,
      }),
    ).toEqual(['A.5.1', 'A.5.2', 'A.8.1']);
  });
});
