import { describe, expect, it, vi } from 'vitest';

vi.mock('@trycompai/auth', () => ({
  BUILT_IN_ROLE_PERMISSIONS: {
    owner: { member: ['read', 'update'] },
    admin: { member: ['read', 'update'] },
    employee: { policy: ['read'] },
    auditor: { member: ['read'] },
  },
}));

import { canReviewAccess } from './reviewers';
import { nextReviewName } from './access-labels';

describe('canReviewAccess (#81)', () => {
  const customRoles = [
    { name: 'it-lead', permissions: { member: ['update'] } },
    { name: 'viewer', permissions: { member: ['read'] } },
  ];

  it('accepts built-in and custom roles with member:update', () => {
    expect(canReviewAccess({ role: 'admin', customRoles })).toBe(true);
    expect(canReviewAccess({ role: 'employee, it-lead', customRoles })).toBe(true);
  });

  it('rejects read-only roles', () => {
    expect(canReviewAccess({ role: 'auditor', customRoles })).toBe(false);
    expect(canReviewAccess({ role: 'employee,viewer', customRoles })).toBe(false);
  });
});

describe('nextReviewName (#98)', () => {
  it('suggests the current half-year, then the next unused one', () => {
    const now = new Date(2026, 10, 19);
    expect(nextReviewName({ existing: [], now })).toBe('H2 2026 access review');
    expect(nextReviewName({ existing: ['H2 2026 access review'], now })).toBe('H1 2027 access review');
  });
});
