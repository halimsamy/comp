jest.mock('@db', () => ({ db: { auditEngagement: { findFirst: jest.fn() } } }));

import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '../auth/types';
import {
  assertAssignedAuditor,
  assertTeamMember,
  isAuditorOnly,
  visibleAuditsWhere,
} from './audit-access';

const ctx = (roles: string[], memberId = 'mem_1'): AuthContext => ({
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: roles,
  memberId,
});

describe('audit access', () => {
  it('detects auditor-only members', () => {
    expect(isAuditorOnly(['auditor'])).toBe(true);
    expect(isAuditorOnly(['auditor', 'admin'])).toBe(false);
    expect(isAuditorOnly(null)).toBe(false);
  });

  it('lets the team see every audit of the org', () => {
    expect(visibleAuditsWhere(ctx(['admin']))).toEqual({ organizationId: 'org_1' });
  });

  it('limits auditors to assigned audits with access still open', () => {
    const now = new Date('2026-06-01');
    expect(visibleAuditsWhere(ctx(['auditor']), now)).toEqual({
      organizationId: 'org_1',
      auditors: { some: { memberId: 'mem_1' } },
      OR: [{ accessEndsAt: null }, { accessEndsAt: { gte: now } }],
    });
  });

  it('only lets assigned auditors assess', () => {
    const audit = { auditors: [{ memberId: 'mem_a' }] };
    expect(assertAssignedAuditor({ audit, auth: ctx(['auditor'], 'mem_a') })).toBe('mem_a');
    expect(() => assertAssignedAuditor({ audit, auth: ctx(['admin'], 'mem_b') })).toThrow(
      ForbiddenException,
    );
  });

  it('keeps auditors out of team responses', () => {
    expect(() => assertTeamMember(ctx(['auditor']))).toThrow(ForbiddenException);
    expect(() => assertTeamMember(ctx(['owner']))).not.toThrow();
  });
});
