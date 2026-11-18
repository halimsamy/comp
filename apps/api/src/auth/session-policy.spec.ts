import {
  describeAllowedMethods,
  isSessionIdle,
  isSignInMethodAllowed,
  resolveSignInMethod,
  shouldTouchSession,
} from './session-policy';

describe('session-policy', () => {
  describe('resolveSignInMethod', () => {
    it.each([
      [{ path: '/magic-link/verify' }, 'magic-link'],
      [{ path: '/sign-in/email-otp' }, 'email-otp'],
      [{ path: '/callback/:id', params: { id: 'google' } }, 'google'],
      [{ path: '/callback/:id', params: { id: 'microsoft' } }, 'microsoft'],
      [{ path: '/sign-in/social', body: { provider: 'github' } }, 'github'],
      [{ path: '/callback/:id', params: { id: 'unknown' } }, null],
      [{ path: '/admin/impersonate-user' }, null],
      [null, null],
    ])('%j -> %s', (ctx, expected) => {
      expect(resolveSignInMethod(ctx)).toBe(expected);
    });
  });

  describe('isSignInMethodAllowed', () => {
    it('allows everything when the org has no restriction', () => {
      expect(isSignInMethodAllowed({ allowed: [], method: 'magic-link' })).toBe(true);
    });
    it('allows sessions with no recorded method (legacy, device agent, impersonation)', () => {
      expect(isSignInMethodAllowed({ allowed: ['google'], method: null })).toBe(true);
    });
    it('blocks a method outside the allow-list', () => {
      expect(isSignInMethodAllowed({ allowed: ['google'], method: 'magic-link' })).toBe(false);
      expect(isSignInMethodAllowed({ allowed: ['google'], method: 'google' })).toBe(true);
    });
  });

  describe('isSessionIdle', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    it('is never idle without a timeout', () => {
      expect(isSessionIdle({ lastActiveAt: new Date(0), timeoutMinutes: null, now })).toBe(false);
    });
    it('is idle only after more than the timeout (PCI DSS 8.2.8: 15 minutes)', () => {
      const at14 = new Date(now.getTime() - 14 * 60_000);
      const at16 = new Date(now.getTime() - 16 * 60_000);
      expect(isSessionIdle({ lastActiveAt: at14, timeoutMinutes: 15, now })).toBe(false);
      expect(isSessionIdle({ lastActiveAt: at16, timeoutMinutes: 15, now })).toBe(true);
    });
  });

  it('touches a session at most once a minute', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(shouldTouchSession({ lastActiveAt: new Date(now.getTime() - 30_000), now })).toBe(false);
    expect(shouldTouchSession({ lastActiveAt: new Date(now.getTime() - 90_000), now })).toBe(true);
  });

  it('describes allowed methods with labels', () => {
    expect(describeAllowedMethods(['google', 'magic-link'])).toBe('Google, magic link');
  });
});
