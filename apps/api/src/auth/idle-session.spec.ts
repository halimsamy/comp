import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

const mockSessionDeleteMany = jest.fn();
const mockSessionUpdateMany = jest.fn();
jest.mock('@db', () => ({
  db: {
    session: {
      deleteMany: (...a: unknown[]) => mockSessionDeleteMany(...a),
      updateMany: (...a: unknown[]) => mockSessionUpdateMany(...a),
    },
  },
}));
const mockRecordAuthEvent = jest.fn();
jest.mock('./auth-events', () => ({
  recordAuthEvent: (...a: unknown[]) => mockRecordAuthEvent(...a),
}));

import { enforceSessionPolicy, revokeIfIdle } from './idle-session';

const now = new Date('2026-11-18T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('idle-session', () => {
  beforeEach(() => jest.clearAllMocks());

  it('revokes an idle session and logs the timeout in the org', async () => {
    const revoked = await revokeIfIdle({
      session: { id: 'ses_1', userId: 'usr_1', updatedAt: minutesAgo(20) },
      organizationId: 'org_1',
      timeoutMinutes: 15,
      path: '/x',
      now,
    });
    expect(revoked).toBe(true);
    expect(mockSessionDeleteMany).toHaveBeenCalledWith({ where: { id: 'ses_1' } });
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', event: 'session_idle_expired' }),
    );
  });

  it('never idles out device-agent sessions', async () => {
    const revoked = await revokeIfIdle({
      session: { id: 'ses_1', userId: 'usr_1', updatedAt: minutesAgo(600), deviceAgent: true },
      organizationId: 'org_1',
      timeoutMinutes: 15,
      path: '/x',
      now,
    });
    expect(revoked).toBe(false);
    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
  });

  it('enforceSessionPolicy: 401 for idle sessions', async () => {
    await expect(
      enforceSessionPolicy({
        session: { id: 'ses_1', userId: 'usr_1', updatedAt: new Date(Date.now() - 20 * 60_000) },
        organizationId: 'org_1',
        policy: { sessionIdleTimeoutMinutes: 15, allowedSignInMethods: [] },
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enforceSessionPolicy: 403 when the sign-in method is not allowed', async () => {
    await expect(
      enforceSessionPolicy({
        session: { id: 'ses_1', userId: 'usr_1', updatedAt: new Date(), signInMethod: 'magic-link' },
        organizationId: 'org_1',
        policy: { sessionIdleTimeoutMinutes: null, allowedSignInMethods: ['google'] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforceSessionPolicy: records activity on an active session', async () => {
    await enforceSessionPolicy({
      session: { id: 'ses_1', userId: 'usr_1', updatedAt: new Date(Date.now() - 2 * 60_000) },
      organizationId: 'org_1',
      policy: { sessionIdleTimeoutMinutes: 15, allowedSignInMethods: [] },
    });
    expect(mockSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ses_1' } }),
    );
  });

  it('enforceSessionPolicy: no policy is a no-op', async () => {
    await enforceSessionPolicy({
      session: { id: 'ses_1', userId: 'usr_1', updatedAt: new Date(0) },
      organizationId: 'org_1',
      policy: undefined,
    });
    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
  });
});
