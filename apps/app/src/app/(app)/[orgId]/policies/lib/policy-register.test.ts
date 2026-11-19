import { describe, expect, it } from 'vitest';
import { filterPolicyRegister, type PolicyRegisterRow, type RegisterFilters } from './policy-register';

const row = (overrides: Partial<PolicyRegisterRow>) =>
  ({
    id: overrides.name ?? 'p',
    name: 'Policy',
    status: 'published',
    department: 'it',
    isArchived: false,
    archivedAt: null,
    pendingVersionId: null,
    approverId: null,
    reviewDate: null,
    updatedAt: new Date('2026-01-01'),
    frameworks: [],
    ...overrides,
  }) as PolicyRegisterRow;

const base: RegisterFilters = {
  search: '',
  stage: 'all',
  department: 'all',
  framework: 'all',
  reviewOverdue: false,
  awaitingMemberId: null,
  sort: 'name',
  direction: 'asc',
};

const policies = [
  row({ name: 'Access', lifecycleStage: 'review_due', reviewDate: new Date('2026-01-01'), frameworks: ['ISO 27001'] }),
  row({ name: 'Backup', lifecycleStage: 'pending_approval', pendingVersionId: 'pv', approverId: 'mem_me', frameworks: ['PCI DSS'] }),
  row({ name: 'Crypto', lifecycleStage: 'published', reviewDate: new Date('2027-05-01') }),
  row({ name: 'Old', isArchived: true }),
];
const names = (rows: PolicyRegisterRow[]) => rows.map((r) => r.name);

describe('filterPolicyRegister', () => {
  it('hides archived policies unless asked', () => {
    expect(names(filterPolicyRegister(policies, base))).toEqual(['Access', 'Backup', 'Crypto']);
    expect(names(filterPolicyRegister(policies, { ...base, stage: 'archived' }))).toEqual(['Old']);
  });

  it('filters by lifecycle stage, framework, overdue review and my approvals', () => {
    expect(names(filterPolicyRegister(policies, { ...base, stage: 'pending_approval' }))).toEqual(['Backup']);
    expect(names(filterPolicyRegister(policies, { ...base, framework: 'ISO 27001' }))).toEqual(['Access']);
    expect(names(filterPolicyRegister(policies, { ...base, reviewOverdue: true }))).toEqual(['Access']);
    expect(names(filterPolicyRegister(policies, { ...base, awaitingMemberId: 'mem_me' }))).toEqual(['Backup']);
    expect(filterPolicyRegister(policies, { ...base, awaitingMemberId: 'mem_other' })).toEqual([]);
  });

  it('sorts by next review with undated policies last', () => {
    expect(names(filterPolicyRegister(policies, { ...base, sort: 'nextReview' }))).toEqual([
      'Access',
      'Crypto',
      'Backup',
    ]);
    expect(
      names(filterPolicyRegister(policies, { ...base, sort: 'nextReview', direction: 'desc' })),
    ).toEqual(['Crypto', 'Access', 'Backup']);
  });
});
