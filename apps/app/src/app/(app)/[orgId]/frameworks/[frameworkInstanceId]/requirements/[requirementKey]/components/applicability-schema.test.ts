import { describe, expect, it } from 'vitest';
import {
  applicabilityFormSchema,
  buildApplicabilityPayload,
  oneYearFrom,
  toFormValues,
} from './applicability-schema';

const now = new Date('2026-11-18T10:00:00Z');
const base = toFormValues({ status: 'applicable', record: null, now });

describe('applicability form', () => {
  it('defaults the CCW re-validation date to one year out', () => {
    expect(base.revalidateAt).toBe('2027-11-18');
    expect(oneYearFrom(now)).toBe('2027-11-18');
  });

  it('sends only the status for applicable (the API clears the rest)', () => {
    expect(buildApplicabilityPayload({ ...base, justification: 'old' })).toEqual({ status: 'applicable' });
  });

  it('requires the full CCW for a compensating control', () => {
    const result = applicabilityFormSchema.safeParse({ ...base, status: 'compensating_control', justification: 'Legacy HSM' });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['constraints', 'objective', 'compensatingControlIds']));
  });

  it('builds the CCW details for the API', () => {
    const values = {
      ...base,
      status: 'compensating_control' as const,
      justification: ' Legacy HSM ',
      constraints: 'c',
      objective: 'o',
      identifiedRisk: 'r',
      compensatingControlIds: ['ctl_1'],
      validation: 'v',
      maintenance: 'm',
    };
    expect(applicabilityFormSchema.safeParse(values).success).toBe(true);
    expect(buildApplicabilityPayload(values)).toEqual({
      status: 'compensating_control',
      justification: 'Legacy HSM',
      details: {
        kind: 'compensating_control',
        constraints: 'c',
        objective: 'o',
        identifiedRisk: 'r',
        compensatingControlIds: ['ctl_1'],
        validation: 'v',
        maintenance: 'm',
        revalidateAt: '2027-11-18',
      },
    });
  });

  it('needs a matrix and a targeted risk analysis for the customized approach', () => {
    const values = { ...base, status: 'customized_approach' as const, justification: 'j', objective: 'o' };
    expect(applicabilityFormSchema.safeParse(values).success).toBe(false);
    const complete = {
      ...values,
      matrix: [{ control: 'MFA everywhere', howMeetsObjective: 'Stops reuse' }, { control: '', howMeetsObjective: '' }],
      targetedRiskAnalysisSubmissionId: 'sub_1',
    };
    expect(applicabilityFormSchema.safeParse(complete).success).toBe(true);
    expect(buildApplicabilityPayload(complete)).toMatchObject({
      details: { kind: 'customized_approach', matrix: [{ control: 'MFA everywhere', howMeetsObjective: 'Stops reuse' }] },
    });
  });

  it('cascades not applicable to sub-requirements only when asked', () => {
    const values = { ...base, status: 'not_applicable' as const, justification: 'No wireless' };
    expect(buildApplicabilityPayload(values)).toEqual({ status: 'not_applicable', justification: 'No wireless' });
    expect(buildApplicabilityPayload({ ...values, applyToChildren: true })).toEqual({
      status: 'not_applicable',
      justification: 'No wireless',
      applyToChildren: true,
    });
  });
});
