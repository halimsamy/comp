jest.mock('better-auth/api', () => ({
  APIError: class APIError extends Error {
    constructor(
      readonly status: string,
      readonly body: Record<string, unknown>,
    ) {
      super(status);
    }
  },
}));

import { APIError } from 'better-auth/api';

const mockOrgFindMany = jest.fn();
const mockOrgFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockSessionFindUnique = jest.fn();
const mockMemberFindMany = jest.fn();
const mockAuditCreateMany = jest.fn();
const mockSessionDeleteMany = jest.fn();
jest.mock('@db', () => ({
  db: {
    organization: {
      findMany: (...a: unknown[]) => mockOrgFindMany(...a),
      findUnique: (...a: unknown[]) => mockOrgFindUnique(...a),
    },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    session: {
      findUnique: (...a: unknown[]) => mockSessionFindUnique(...a),
      deleteMany: (...a: unknown[]) => mockSessionDeleteMany(...a),
    },
    member: { findMany: (...a: unknown[]) => mockMemberFindMany(...a) },
    auditLog: { createMany: (...a: unknown[]) => mockAuditCreateMany(...a) },
  },
}));

import {
  beforeSessionCreate,
  handleSessionBeforeHook,
  recordSignInEvents,
  type AuthHookContext,
} from './auth-session-hooks';

type HookOverrides = Omit<Partial<AuthHookContext>, 'context'> & {
  context?: Partial<AuthHookContext['context']>;
};

function hookCtx(over: HookOverrides): AuthHookContext {
  const { context, ...rest } = over;
  return {
    path: '/x',
    headers: new Headers({ 'x-forwarded-for': '10.0.0.1', 'user-agent': 'jest' }),
    getSignedCookie: jest.fn().mockResolvedValue('tok_1'),
    ...rest,
    context: {
      secret: 's',
      authCookies: { sessionToken: { name: 'session_token' } },
      ...context,
    },
  };
}

describe('auth-session-hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMemberFindMany.mockResolvedValue([{ id: 'mem_1', organizationId: 'org_1' }]);
  });

  describe('beforeSessionCreate', () => {
    it('records the sign-in method and picks the newest org', async () => {
      mockOrgFindMany.mockResolvedValue([
        { id: 'org_new', allowedSignInMethods: [] },
        { id: 'org_old', allowedSignInMethods: [] },
      ]);
      const res = await beforeSessionCreate({ userId: 'usr_1' }, { path: '/magic-link/verify' });
      expect(res.data).toEqual({
        userId: 'usr_1',
        signInMethod: 'magic-link',
        activeOrganizationId: 'org_new',
      });
    });

    it('skips orgs that do not allow the method', async () => {
      mockOrgFindMany.mockResolvedValue([
        { id: 'org_google_only', allowedSignInMethods: ['google'] },
        { id: 'org_open', allowedSignInMethods: [] },
      ]);
      const res = await beforeSessionCreate({ userId: 'usr_1' }, { path: '/sign-in/email-otp' });
      expect(res.data.activeOrganizationId).toBe('org_open');
    });

    it('rejects the sign-in when no org allows the method', async () => {
      mockOrgFindMany.mockResolvedValue([{ id: 'org_1', allowedSignInMethods: ['google'] }]);
      await expect(
        beforeSessionCreate({ userId: 'usr_1' }, { path: '/magic-link/verify' }),
      ).rejects.toBeInstanceOf(APIError);
    });

    it('still creates the session when the org lookup fails', async () => {
      mockOrgFindMany.mockRejectedValue(new Error('db down'));
      const res = await beforeSessionCreate({ userId: 'usr_1' }, null);
      expect(res.data).toEqual({ userId: 'usr_1', signInMethod: null });
    });
  });

  describe('recordSignInEvents', () => {
    it('logs a successful sign-in in every org of the user', async () => {
      await recordSignInEvents(
        hookCtx({
          path: '/callback/:id',
          params: { id: 'google' },
          context: { newSession: { session: { userId: 'usr_1', ipAddress: '1.2.3.4' } } },
        }),
      );
      const rows = mockAuditCreateMany.mock.calls[0][0].data;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        organizationId: 'org_1',
        userId: 'usr_1',
        description: 'Signed in with Google',
        data: expect.objectContaining({ resource: 'auth', permission: 'sign_in', ipAddress: '1.2.3.4' }),
      });
    });

    it('does not log impersonation sessions as sign-ins', async () => {
      await recordSignInEvents(
        hookCtx({
          path: '/admin/impersonate-user',
          context: { newSession: { session: { userId: 'usr_1' } } },
        }),
      );
      expect(mockAuditCreateMany).not.toHaveBeenCalled();
    });

    it('logs a failed email-code attempt for a known user', async () => {
      mockUserFindUnique.mockResolvedValue({ id: 'usr_1' });
      await recordSignInEvents(
        hookCtx({
          path: '/sign-in/email-otp',
          body: { email: 'A@b.com', otp: '000000' },
          context: { returned: new APIError('BAD_REQUEST', { message: 'Invalid OTP' }) },
        }),
      );
      expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' }, select: { id: true } });
      expect(mockAuditCreateMany.mock.calls[0][0].data[0].data.permission).toBe('sign_in_failed');
    });
  });

  describe('handleSessionBeforeHook', () => {
    it('logs sign-out', async () => {
      mockSessionFindUnique.mockResolvedValue({ id: 'ses_1', userId: 'usr_1', updatedAt: new Date() });
      await handleSessionBeforeHook(hookCtx({ path: '/sign-out' }));
      expect(mockAuditCreateMany.mock.calls[0][0].data[0].description).toBe('Signed out');
    });

    it('revokes an idle session before /get-session returns it', async () => {
      mockSessionFindUnique.mockResolvedValue({
        id: 'ses_1',
        userId: 'usr_1',
        updatedAt: new Date(Date.now() - 60 * 60_000),
        deviceAgent: false,
        activeOrganizationId: 'org_1',
      });
      mockOrgFindUnique.mockResolvedValue({ sessionIdleTimeoutMinutes: 15 });
      await handleSessionBeforeHook(hookCtx({ path: '/get-session' }));
      expect(mockSessionDeleteMany).toHaveBeenCalledWith({ where: { id: 'ses_1' } });
    });

    it('ignores other paths', async () => {
      await handleSessionBeforeHook(hookCtx({ path: '/sign-in/social' }));
      expect(mockSessionFindUnique).not.toHaveBeenCalled();
    });
  });
});
