import {
  scoreControl,
  scoreFramework,
  type ScoringContext,
  type ScoringControl,
} from './framework-scoring';

const ctx = (fresh: string[] = [], submitted: string[] = fresh): ScoringContext => ({
  freshForms: new Set(fresh),
  submittedForms: new Set(submitted),
});

const control = (overrides: Partial<ScoringControl> & { id: string }): ScoringControl => ({
  policies: [],
  tasks: [],
  formTypes: [],
  hasNotRelevantForms: false,
  ismsDocuments: [],
  ...overrides,
});

describe('scoreControl', () => {
  it('is completed when every artifact is done', () => {
    const score = scoreControl(
      control({
        id: 'c1',
        policies: [{ id: 'p1', status: 'published' }],
        tasks: [{ id: 't1', status: 'not_relevant' }],
        formTypes: ['penetration_test'],
        ismsDocuments: [{ id: 'd1', published: true }],
      }),
      ctx(['penetration_test']),
    );
    expect(score).toMatchObject({ status: 'completed', percent: 100 });
    expect(score.counts.ismsDocuments).toEqual({ total: 1, completed: 1 });
  });

  it('counts an unpublished ISMS document as outstanding', () => {
    const score = scoreControl(
      control({
        id: 'c1',
        policies: [{ id: 'p1', status: 'published' }],
        ismsDocuments: [{ id: 'd1', published: false }],
      }),
      ctx(),
    );
    expect(score).toMatchObject({ status: 'in_progress', percent: 50 });
  });

  it('treats a stale form as outstanding but started', () => {
    const score = scoreControl(
      control({ id: 'c1', formTypes: ['rbac_matrix'] }),
      ctx([], ['rbac_matrix']),
    );
    expect(score).toMatchObject({ status: 'in_progress', percent: 0 });
  });

  it('is not started with only draft policies and todo tasks', () => {
    const score = scoreControl(
      control({
        id: 'c1',
        policies: [{ id: 'p1', status: 'draft' }],
        tasks: [{ id: 't1', status: 'todo' }],
      }),
      ctx(),
    );
    expect(score.status).toBe('not_started');
  });

  it('is not relevant when its only evidence forms are marked not relevant', () => {
    expect(scoreControl(control({ id: 'c1', hasNotRelevantForms: true }), ctx()).status).toBe(
      'not_relevant',
    );
  });
});

describe('scoreFramework', () => {
  const done = control({ id: 'done', policies: [{ id: 'p1', status: 'published' }] });
  const open = control({ id: 'open', tasks: [{ id: 't1', status: 'todo' }] });
  const shared = control({ id: 'shared', policies: [{ id: 'p1', status: 'published' }] });

  it('returns N/M controls and the artifact-weighted score', () => {
    const score = scoreFramework({
      controls: [done, open],
      requirements: [
        { key: 'r1', controlIds: ['done'] },
        { key: 'r2', controlIds: ['open'] },
        { key: 'r3', controlIds: [] },
      ],
      applicability: new Map(),
      ctx: ctx(),
    });
    expect(score).toMatchObject({
      complianceScore: 50,
      controlsComplete: 1,
      controlsTotal: 2,
      requirementsSatisfied: 1,
      requirementsTotal: 3,
      requirementsNotApplicable: 0,
    });
    expect(score.requirements.r3.status).toBe('no_controls');
  });

  it('excludes not-applicable requirements and controls only mapped to them', () => {
    const score = scoreFramework({
      controls: [done, open, shared],
      requirements: [
        { key: 'r1', controlIds: ['done', 'shared'] },
        { key: 'na', controlIds: ['open', 'shared'] },
      ],
      applicability: new Map([['na', 'not_applicable' as const]]),
      ctx: ctx(),
    });
    expect(score.controls.open.status).toBe('not_applicable');
    expect(score.controls.shared.status).toBe('completed');
    expect(score.requirements.na).toMatchObject({
      status: 'not_applicable',
      applicability: 'not_applicable',
    });
    expect(score).toMatchObject({
      complianceScore: 100,
      controlsComplete: 2,
      controlsTotal: 2,
      controlsNotApplicable: 1,
      requirementsTotal: 1,
      requirementsNotApplicable: 1,
    });
  });

  it('still scores compensating-control requirements on their evidence', () => {
    const score = scoreFramework({
      controls: [open],
      requirements: [{ key: 'r1', controlIds: ['open'] }],
      applicability: new Map([['r1', 'compensating_control' as const]]),
      ctx: ctx(),
    });
    expect(score.requirements.r1).toMatchObject({
      status: 'not_started',
      applicability: 'compensating_control',
    });
    expect(score.requirementsTotal).toBe(1);
  });

  it('counts a shared policy once in requirement counts', () => {
    const score = scoreFramework({
      controls: [done, shared],
      requirements: [{ key: 'r1', controlIds: ['done', 'shared'] }],
      applicability: new Map(),
      ctx: ctx(),
    });
    expect(score.requirements.r1.counts.policies).toEqual({ total: 1, completed: 1 });
    expect(score.requirements.r1).toMatchObject({ controlsTotal: 2, controlsComplete: 2 });
  });

  it('returns 0 for a framework without evidence', () => {
    const score = scoreFramework({
      controls: [],
      requirements: [],
      applicability: new Map(),
      ctx: ctx(),
    });
    expect(score).toMatchObject({ complianceScore: 0, controlsTotal: 0 });
  });
});
