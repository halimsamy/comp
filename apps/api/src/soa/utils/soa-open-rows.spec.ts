import { listUndecidedRows, summarizeCodes } from './soa-open-rows';

const questions = [
  { id: 'q1', columnMapping: { closure: '5.1', title: 'Policies' } },
  { id: 'q2', columnMapping: { closure: '7.4', title: 'Physical monitoring' } },
  { id: 'q3', columnMapping: { closure: '8.1', title: 'Endpoints' } },
];

describe('listUndecidedRows', () => {
  it('lists rows with no answer or a null decision', () => {
    const rows = listUndecidedRows({
      questions,
      answers: [
        { questionId: 'q1', isApplicable: true },
        { questionId: 'q3', isApplicable: null },
      ],
      isFullyRemote: false,
    });
    expect(rows.map((r) => r.code)).toEqual(['A.7.4', 'A.8.1']);
  });

  it('treats a remote org’s unanswered physical rows as decided', () => {
    const rows = listUndecidedRows({ questions, answers: [], isFullyRemote: true });
    expect(rows.map((r) => r.code)).toEqual(['A.5.1', 'A.8.1']);
  });
});

describe('summarizeCodes', () => {
  it('caps the list', () => {
    expect(summarizeCodes(['a', 'b', 'c'], 2)).toBe('a, b and 1 more');
    expect(summarizeCodes(['a'])).toBe('a');
  });
});
