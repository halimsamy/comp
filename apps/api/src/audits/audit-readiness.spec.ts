import { computeReadiness, summarizeProgress, taskNeedsUpdate } from './audit-readiness';

const task = (over: Partial<{ status: string; needsUpdate: boolean }> = {}) => ({
  id: 'tsk_1',
  title: 'Access review',
  status: 'done',
  filesInPeriod: 1,
  needsUpdate: false,
  ...over,
});

describe('computeReadiness', () => {
  const empty = { tasks: [], policies: [], documents: [] };

  it('marks not applicable requirements', () => {
    expect(computeReadiness({ applicable: false, evidence: empty })).toBe('not_applicable');
  });

  it('is not ready without any evidence', () => {
    expect(computeReadiness({ applicable: true, evidence: empty })).toBe('not_ready');
  });

  it('is ready when tasks are done, policies published and forms submitted', () => {
    expect(
      computeReadiness({
        applicable: true,
        evidence: {
          tasks: [task(), task({ status: 'not_relevant' })],
          policies: [{ id: 'pol_1', name: 'Access', status: 'published' }],
          documents: [{ formType: 'meeting', slug: 'meeting', title: 'Meeting', submissionsInPeriod: 2 }],
        },
      }),
    ).toBe('ready');
  });

  it('needs an update when a task file expired', () => {
    expect(
      computeReadiness({ applicable: true, evidence: { ...empty, tasks: [task({ needsUpdate: true })] } }),
    ).toBe('needs_update');
  });

  it('is not ready with a draft policy or a missing submission', () => {
    expect(
      computeReadiness({
        applicable: true,
        evidence: { ...empty, policies: [{ id: 'p', name: 'P', status: 'draft' }] },
      }),
    ).toBe('not_ready');
    expect(
      computeReadiness({
        applicable: true,
        evidence: { ...empty, documents: [{ formType: 'm', slug: null, title: 'M', submissionsInPeriod: 0 }] },
      }),
    ).toBe('not_ready');
  });
});

describe('taskNeedsUpdate', () => {
  const now = new Date('2026-06-01');
  it('is false without dated files', () => {
    expect(taskNeedsUpdate([{ validFrom: null, validUntil: null }], now)).toBe(false);
  });
  it('is true only when every dated file expired', () => {
    const expired = { validFrom: new Date('2025-01-01'), validUntil: new Date('2026-01-01') };
    const current = { validFrom: new Date('2026-01-01'), validUntil: new Date('2027-01-01') };
    expect(taskNeedsUpdate([expired], now)).toBe(true);
    expect(taskNeedsUpdate([expired, current], now)).toBe(false);
  });
});

describe('summarizeProgress', () => {
  it('counts only in-scope requirements', () => {
    expect(
      summarizeProgress({
        requirementIds: ['r1', 'r2', 'r3'],
        reviews: [
          { requirementId: 'r1', status: 'accepted' },
          { requirementId: 'r2', status: 'flagged' },
          { requirementId: 'na', status: 'accepted' },
        ],
      }),
    ).toEqual({ total: 3, accepted: 1, flagged: 1, requested: 0, notReviewed: 1 });
  });
});
