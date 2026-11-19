import { isCustomizedApproachEligible, parseApplicabilityDetails } from './applicability-details';

const customized = {
  kind: 'customized_approach',
  objective: 'Only authorised people change NSC rules',
  matrix: [{ control: 'GitOps firewall rules', howMeetsObjective: 'Every change is peer reviewed' }],
  targetedRiskAnalysisSubmissionId: 'evs_1',
};

describe('parseApplicabilityDetails', () => {
  it('stores nothing for applicable, whatever is sent', () => {
    expect(parseApplicabilityDetails({ status: 'applicable', details: customized })).toBeNull();
  });

  it('allows not applicable without details', () => {
    expect(parseApplicabilityDetails({ status: 'not_applicable', details: undefined })).toBeNull();
  });

  it('accepts a customized approach matrix with its TRA', () => {
    expect(parseApplicabilityDetails({ status: 'customized_approach', details: customized })).toEqual(
      customized,
    );
  });

  it('rejects a matrix without rows or TRA', () => {
    expect(() =>
      parseApplicabilityDetails({
        status: 'customized_approach',
        details: { ...customized, matrix: [] },
      }),
    ).toThrow('matrix');
    expect(() =>
      parseApplicabilityDetails({
        status: 'customized_approach',
        details: { ...customized, targetedRiskAnalysisSubmissionId: '' },
      }),
    ).toThrow('targeted risk analysis');
  });

  it('rejects an incomplete compensating controls worksheet', () => {
    expect(() =>
      parseApplicabilityDetails({
        status: 'compensating_control',
        details: { kind: 'compensating_control', constraints: 'x' },
      }),
    ).toThrow('Invalid compensating_control details');
  });

  it('rejects details for another status', () => {
    expect(() =>
      parseApplicabilityDetails({ status: 'compensating_control', details: customized }),
    ).toThrow('not compensating_control');
  });
});

describe('isCustomizedApproachEligible', () => {
  it.each([
    ['3.3.1', false],
    ['3.3.1.2', false],
    ['11.3.2', false],
    ['A2.1.1', false],
    ['A3.2.5.1', false],
    ['1.2.1', true],
    ['11.3.2.1', true],
    ['A1.1.1', true],
  ])('%s -> %s', (identifier, eligible) => {
    expect(isCustomizedApproachEligible(identifier)).toBe(eligible);
  });
});
