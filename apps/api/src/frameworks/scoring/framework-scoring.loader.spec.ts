const mockDb = {
  requirementMap: { findMany: jest.fn() },
  frameworkControlPolicyLink: { findMany: jest.fn() },
  frameworkControlTaskLink: { findMany: jest.fn() },
  frameworkControlDocumentTypeLink: { findMany: jest.fn() },
  requirementApplicability: { findMany: jest.fn() },
  evidenceSubmission: { groupBy: jest.fn() },
  evidenceFormSetting: { findMany: jest.fn() },
  ismsDocumentControlLink: { findMany: jest.fn() },
};

jest.mock('@db', () => ({ db: mockDb }));

import { loadEvidenceFormContext, loadFrameworkScores } from './framework-scoring.loader';

const now = new Date('2026-11-18T00:00:00.000Z');
const ORG = 'org_1';

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.requirementMap.findMany.mockResolvedValue([
    { frameworkInstanceId: 'fi1', controlId: 'c1', requirementId: 'r1', customRequirementId: null },
    { frameworkInstanceId: 'fi1', controlId: 'c2', requirementId: 'r2', customRequirementId: null },
  ]);
  mockDb.frameworkControlPolicyLink.findMany.mockResolvedValue([
    { frameworkInstanceId: 'fi1', controlId: 'c1', policy: { id: 'p1', status: 'published' } },
  ]);
  mockDb.frameworkControlTaskLink.findMany.mockResolvedValue([]);
  mockDb.frameworkControlDocumentTypeLink.findMany.mockResolvedValue([
    { frameworkInstanceId: 'fi1', controlId: 'c2', formType: 'tabletop_exercise' },
  ]);
  mockDb.requirementApplicability.findMany.mockResolvedValue([]);
  mockDb.evidenceSubmission.groupBy.mockResolvedValue([
    // 19 months old: stale for the 12-month tabletop cadence (PCI 12.10.2).
    { formType: 'tabletop_exercise', _max: { submittedAt: new Date('2025-04-18T00:00:00.000Z') } },
    { formType: 'penetration_test', _max: { submittedAt: new Date('2026-04-18T00:00:00.000Z') } },
  ]);
  mockDb.evidenceFormSetting.findMany.mockResolvedValue([]);
  mockDb.ismsDocumentControlLink.findMany.mockResolvedValue([
    { controlId: 'c1', ismsDocument: { id: 'd1', status: 'draft', currentVersionId: null } },
  ]);
});

describe('loadEvidenceFormContext', () => {
  it('ignores rejected submissions and applies per-form cadence', async () => {
    const result = await loadEvidenceFormContext({ organizationId: ORG, now });
    expect(mockDb.evidenceSubmission.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, status: { not: 'rejected' } },
      }),
    );
    expect([...result.freshForms]).toEqual(['penetration_test']);
    expect([...result.submittedForms]).toEqual(['tabletop_exercise', 'penetration_test']);
  });

  it('treats retired forms as not relevant and honours the org cadence override (#130, #50)', async () => {
    mockDb.evidenceFormSetting.findMany.mockResolvedValueOnce([
      { formType: 'tabletop_exercise', isNotRelevant: false, cadenceMonthsOverride: 24 },
    ]);
    const result = await loadEvidenceFormContext({ organizationId: ORG, now });
    expect(result.notRelevantForms.has('rbac_matrix')).toBe(true);
    expect(result.notRelevantForms.has('infrastructure_inventory')).toBe(true);
    expect(result.notRelevantForms.has('penetration_test')).toBe(false);
    expect([...result.freshForms]).toEqual(['tabletop_exercise', 'penetration_test']);
  });
});

describe('loadFrameworkScores', () => {
  it('scopes every query to the organization and scores each instance', async () => {
    const scores = await loadFrameworkScores({
      organizationId: ORG,
      frameworkInstanceIds: ['fi1'],
      requirementKeys: new Map([['fi1', ['r1', 'r2', 'r3']]]),
      now,
    });
    for (const model of [
      mockDb.requirementMap,
      mockDb.frameworkControlPolicyLink,
      mockDb.frameworkControlTaskLink,
      mockDb.frameworkControlDocumentTypeLink,
    ]) {
      expect(model.findMany.mock.calls[0][0].where.frameworkInstance).toEqual({
        organizationId: ORG,
      });
    }
    expect(mockDb.requirementApplicability.findMany.mock.calls[0][0].where.organizationId).toBe(ORG);
    expect(mockDb.ismsDocumentControlLink.findMany.mock.calls[0][0].where.ismsDocument).toEqual({
      organizationId: ORG,
    });

    const score = scores.get('fi1')!;
    // c1: published policy + draft ISMS doc; c2: stale tabletop exercise.
    expect(score.controls.c1).toMatchObject({ status: 'in_progress', percent: 50 });
    expect(score.controls.c2.status).toBe('in_progress');
    expect(score).toMatchObject({
      complianceScore: 33,
      controlsComplete: 0,
      controlsTotal: 2,
      requirementsTotal: 3,
    });
    expect(score.requirements.r3.status).toBe('no_controls');
  });

  it('applies requirement applicability per instance', async () => {
    mockDb.requirementApplicability.findMany.mockResolvedValue([
      { frameworkInstanceId: 'fi1', requirementKey: 'r2', status: 'not_applicable' },
    ]);
    const score = (await loadFrameworkScores({ organizationId: ORG, frameworkInstanceIds: ['fi1'], now })).get('fi1')!;
    expect(score.controls.c2.status).toBe('not_applicable');
    expect(score).toMatchObject({ controlsTotal: 1, requirementsNotApplicable: 1 });
  });
});
