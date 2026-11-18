import { describe, expect, it } from 'bun:test';
import { evidenceFormDefinitionList } from './definitions';
import { evidenceFormCadenceMonths, evidenceFormNextDueAt, isEvidenceFormFresh } from './cadence';

describe('evidence form cadence', () => {
  it('gives every form a positive cadence', () => {
    for (const form of evidenceFormDefinitionList) {
      expect(form.cadenceMonths).toBeGreaterThan(0);
    }
  });

  it('uses the PCI DSS frequencies', () => {
    expect(evidenceFormCadenceMonths('rbac-matrix')).toBe(6);
    expect(evidenceFormCadenceMonths('penetration-test')).toBe(12);
    expect(evidenceFormCadenceMonths('targeted-risk-analysis')).toBe(12);
  });

  it('computes the next due date from the last submission', () => {
    const due = evidenceFormNextDueAt({
      formType: 'rbac-matrix',
      lastSubmittedAt: '2026-01-15T00:00:00.000Z',
    });
    expect(due?.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(evidenceFormNextDueAt({ formType: 'rbac-matrix', lastSubmittedAt: null })).toBeNull();
  });

  it('is fresh only inside the cadence window', () => {
    const now = new Date('2026-11-18T00:00:00.000Z');
    expect(
      isEvidenceFormFresh({ formType: 'penetration-test', lastSubmittedAt: '2026-01-01', now }),
    ).toBe(true);
    expect(
      isEvidenceFormFresh({ formType: 'rbac-matrix', lastSubmittedAt: '2026-01-01', now }),
    ).toBe(false);
    expect(isEvidenceFormFresh({ formType: 'rbac-matrix', lastSubmittedAt: null, now })).toBe(false);
  });
});
