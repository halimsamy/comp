import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { db } from '@db';
import { recordAuthEvent } from './auth-events';
import {
  describeAllowedMethods,
  isSessionIdle,
  isSignInMethodAllowed,
  shouldTouchSession,
} from './session-policy';

export interface IdleCheckSession {
  id: string;
  userId: string;
  updatedAt: Date | string;
  deviceAgent?: boolean | null;
  signInMethod?: string | null;
}

export interface OrgSessionPolicy {
  sessionIdleTimeoutMinutes: number | null;
  allowedSignInMethods: string[];
}

/**
 * Revoke a session that has been idle longer than the org's timeout (PCI DSS
 * 8.2.8). Returns true when the session was revoked. Device-agent sessions are
 * machine sessions with no user at the keyboard, so they are never idled out.
 */
export async function revokeIfIdle({
  session,
  organizationId,
  timeoutMinutes,
  path,
  now = new Date(),
}: {
  session: IdleCheckSession;
  organizationId: string;
  timeoutMinutes: number | null | undefined;
  path: string;
  now?: Date;
}): Promise<boolean> {
  if (session.deviceAgent) return false;
  if (!isSessionIdle({ lastActiveAt: session.updatedAt, timeoutMinutes, now })) {
    return false;
  }

  await db.session.deleteMany({ where: { id: session.id } });
  await recordAuthEvent({
    userId: session.userId,
    organizationId,
    event: 'session_idle_expired',
    description: `Session ended after ${timeoutMinutes} minutes of inactivity`,
    path,
  });
  return true;
}

/** Record activity on the session, at most once a minute, so idle time is measured from the last request. */
export async function touchSession({
  session,
  now = new Date(),
}: {
  session: IdleCheckSession;
  now?: Date;
}): Promise<void> {
  if (!shouldTouchSession({ lastActiveAt: session.updatedAt, now })) return;
  try {
    await db.session.updateMany({
      where: { id: session.id },
      data: { updatedAt: now },
    });
  } catch (err) {
    console.error('[Auth] Failed to record session activity:', err);
  }
}

/**
 * Apply the active org's session policy to an authenticated request: idle
 * timeout (401, session revoked) and allowed sign-in methods (403).
 */
export async function enforceSessionPolicy({
  session,
  organizationId,
  policy,
}: {
  session: IdleCheckSession;
  organizationId: string;
  policy: OrgSessionPolicy | null | undefined;
}): Promise<void> {
  if (!policy) return;
  const idle = await revokeIfIdle({
    session,
    organizationId,
    timeoutMinutes: policy.sessionIdleTimeoutMinutes,
    path: '/session/idle-timeout',
  });
  if (idle) {
    throw new UnauthorizedException(
      'Your session expired after a period of inactivity. Please sign in again.',
    );
  }
  if (
    !isSignInMethodAllowed({
      allowed: policy.allowedSignInMethods,
      method: session.signInMethod,
    })
  ) {
    throw new ForbiddenException(
      `This organization requires signing in with ${describeAllowedMethods(policy.allowedSignInMethods)}. Sign out and sign in again with an allowed method.`,
    );
  }
  await touchSession({ session });
}
