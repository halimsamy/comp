import type { Audit, AuditRequirement } from '@/hooks/use-audits';
import { describe, expect, it } from 'vitest';
import {
  accessLabel,
  blockedByLabel,
  countByStatus,
  evidenceProgress,
  itemStatus,
  plural,
} from './audit-labels';
import { auditSchema, toAuditFormValues, toAuditPayload } from './audit-schema';

const requirement = (over: Partial<AuditRequirement>): AuditRequirement => ({
  id: 'r',
  identifier: 'A.5.1',
  name: 'Policies',
  description: '',
  controls: [],
  tasks: [],
  policies: [],
  documents: [],
  readiness: 'ready',
  blockedBy: [],
  review: null,
  commentCount: 0,
  openRequestCount: 0,
  ...over,
});

describe('audit labels', () => {
  it('prefers the auditor assessment over readiness, except for N/A', () => {
    expect(itemStatus(requirement({}))).toBe('ready');
    expect(
      itemStatus(requirement({ review: { status: 'flagged', note: null, reviewedAt: '', reviewedBy: null } })),
    ).toBe('flagged');
    expect(
      itemStatus(
        requirement({
          readiness: 'not_applicable',
          review: { status: 'accepted', note: null, reviewedAt: '', reviewedBy: null },
        }),
      ),
    ).toBe('not_applicable');
  });

  it('counts requirements per status', () => {
    const counts = countByStatus([
      requirement({}),
      requirement({ readiness: 'needs_update' }),
      requirement({ readiness: 'not_ready' }),
    ]);
    expect(counts).toMatchObject({ ready: 1, needs_update: 1, not_ready: 1, accepted: 0 });
  });

  it('describes auditor access', () => {
    const now = new Date('2026-06-01');
    expect(accessLabel({ accessEndsAt: null }, now)).toBe('Auditor access has no end date');
    expect(accessLabel({ accessEndsAt: '2026-05-01T23:59:59.999Z' }, now)).toContain('ended');
    expect(accessLabel({ accessEndsAt: '2026-07-01T23:59:59.999Z' }, now)).toContain('until');
  });
});

describe('audit schema', () => {
  const values = {
    frameworkInstanceId: 'frm_1',
    title: 'ISO 27001 stage 2',
    firmName: '',
    status: 'planned' as const,
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    accessEndsAt: '',
    auditorMemberIds: ['mem_1'],
    pendingAuditorEmails: ['qsa@firm.com'],
  };

  it('rejects a period that ends before it starts', () => {
    const result = auditSchema.safeParse({ ...values, periodEnd: '2025-12-31' });
    expect(result.success).toBe(false);
  });

  it('builds a create payload without empty optional fields', () => {
    expect(toAuditPayload({ values, audit: null })).toEqual({
      frameworkInstanceId: 'frm_1',
      title: 'ISO 27001 stage 2',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      auditorMemberIds: ['mem_1'],
      pendingAuditorEmails: ['qsa@firm.com'],
    });
  });

  it('rejects an invalid invited auditor email', () => {
    expect(auditSchema.safeParse({ ...values, pendingAuditorEmails: ['not-an-email'] }).success).toBe(
      false,
    );
  });

  it('clears optional fields on update and round-trips an audit', () => {
    const audit = {
      id: 'aud_1',
      frameworkInstanceId: 'frm_1',
      title: 'A',
      firmName: 'CB',
      status: 'in_progress',
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-12-31T23:59:59.999Z',
      accessEndsAt: null,
      auditors: [{ memberId: 'mem_1', name: 'Ann', email: 'a@cb', image: null }],
    } as unknown as Audit;
    const form = toAuditFormValues(audit);
    expect(form).toMatchObject({ periodEnd: '2026-12-31', accessEndsAt: '', auditorMemberIds: ['mem_1'] });
    expect(toAuditPayload({ values: { ...form, firmName: '' }, audit })).toMatchObject({
      firmName: null,
      accessEndsAt: null,
      status: 'in_progress',
    });
  });
});

describe('evidence progress (#108)', () => {
  it('summarises partial readiness', () => {
    expect(
      evidenceProgress(
        requirement({
          tasks: [
            { id: 't1', title: 'A', status: 'done', filesInPeriod: 1, needsUpdate: false },
            { id: 't2', title: 'B', status: 'todo', filesInPeriod: 0, needsUpdate: false },
          ],
          policies: [{ id: 'p1', name: 'P', status: 'draft' }],
        }),
      ),
    ).toBe('1/2 tasks done · 0/1 policies published');
    expect(evidenceProgress(requirement({}))).toBe('No evidence linked');
  });

  it('shortens the blocked-by list', () => {
    expect(blockedByLabel(['A', 'B', 'C', 'D'])).toBe('Blocked by A, B +2 more');
    expect(blockedByLabel([])).toBeNull();
  });

  it('pluralizes', () => {
    expect(plural({ count: 1, word: 'comment' })).toBe('1 comment');
    expect(plural({ count: 2, word: 'comment' })).toBe('2 comments');
  });
});
