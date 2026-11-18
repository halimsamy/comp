import { db } from '@db';
import { APIError } from 'better-auth/api';
import { getClientIp, recordAuthEvent } from './auth-events';
import { revokeIfIdle } from './idle-session';
import {
  describeAllowedMethods,
  isSignInMethodAllowed,
  resolveSignInMethod,
  SIGN_IN_METHOD_LABELS,
  type SignInMethod,
} from './session-policy';

interface EndpointContextLike {
  path?: string;
  params?: Record<string, string | undefined> | null;
  body?: unknown;
}

interface NewSessionLike {
  session: { userId: string; ipAddress?: string | null; userAgent?: string | null };
}

/** The slice of better-auth's hook context these hooks read. */
export interface AuthHookContext {
  path: string;
  params?: Record<string, string | undefined> | null;
  body?: unknown;
  headers?: Headers;
  context: {
    newSession?: NewSessionLike | null;
    returned?: unknown;
    secret: string;
    authCookies: { sessionToken: { name: string } };
  };
  getSignedCookie: (key: string, secret: string) => Promise<string | null | false>;
}

/**
 * Pick the session's active organization: the most recent org whose allowed
 * sign-in methods include the one being used. Throws when the user belongs to
 * orgs but none of them allows this method.
 */
export async function resolveSessionOrganization({
  userId,
  method,
}: {
  userId: string;
  method: SignInMethod | null;
}): Promise<string | null> {
  const orgs = await db.organization.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, allowedSignInMethods: true },
  });
  if (orgs.length === 0) return null;

  const allowed = orgs.find((org) =>
    isSignInMethodAllowed({ allowed: org.allowedSignInMethods, method }),
  );
  if (allowed) return allowed.id;

  throw new APIError('FORBIDDEN', {
    message: `Your organization requires signing in with ${describeAllowedMethods(orgs[0].allowedSignInMethods)}.`,
  });
}

/** databaseHooks.session.create.before: set the active org and record how the session was created. */
export async function beforeSessionCreate<T extends { userId: string }>(
  session: T,
  context: EndpointContextLike | null | undefined,
): Promise<{ data: T & { activeOrganizationId?: string; signInMethod: SignInMethod | null } }> {
  const signInMethod = resolveSignInMethod(context);
  let organizationId: string | null = null;
  try {
    organizationId = await resolveSessionOrganization({
      userId: session.userId,
      method: signInMethod,
    });
  } catch (error) {
    if (error instanceof APIError) throw error;
    // Lookup failures must not block sign-in; the session just has no active org.
    console.error('[Better Auth] Session creation hook error:', error);
  }
  return {
    data: {
      ...session,
      signInMethod,
      ...(organizationId ? { activeOrganizationId: organizationId } : {}),
    },
  };
}

/** After hook: log successful and failed sign-ins. */
export async function recordSignInEvents(ctx: AuthHookContext): Promise<void> {
  const newSession = ctx.context.newSession;
  if (newSession) {
    const method = resolveSignInMethod(ctx);
    if (!method) return; // impersonation and other non-login session creation
    await recordAuthEvent({
      userId: newSession.session.userId,
      event: 'sign_in',
      description: `Signed in with ${SIGN_IN_METHOD_LABELS[method]}`,
      path: ctx.path,
      signInMethod: method,
      ipAddress: newSession.session.ipAddress,
      userAgent: newSession.session.userAgent,
    });
    return;
  }

  if (ctx.path !== '/sign-in/email-otp') return;
  if (!(ctx.context.returned instanceof APIError)) return;
  const email = readEmail(ctx.body);
  if (!email) return;
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  await recordAuthEvent({
    userId: user.id,
    event: 'sign_in_failed',
    description: 'Failed sign-in attempt (invalid email code)',
    path: ctx.path,
    signInMethod: 'email-otp',
    ipAddress: getClientIp(ctx.headers),
    userAgent: ctx.headers?.get('user-agent'),
  });
}

/**
 * Before hook: log sign-outs, and end idle sessions before /get-session
 * returns them, so the app redirects to sign-in on the first page load.
 */
export async function handleSessionBeforeHook(ctx: AuthHookContext): Promise<void> {
  if (ctx.path !== '/sign-out' && ctx.path !== '/get-session') return;
  try {
    const token = await ctx.getSignedCookie(
      ctx.context.authCookies.sessionToken.name,
      ctx.context.secret,
    );
    if (!token) return;
    const session = await db.session.findUnique({
      where: { token },
      select: {
        id: true,
        userId: true,
        updatedAt: true,
        deviceAgent: true,
        activeOrganizationId: true,
      },
    });
    if (!session) return;

    if (ctx.path === '/sign-out') {
      await recordAuthEvent({
        userId: session.userId,
        event: 'sign_out',
        description: 'Signed out',
        path: ctx.path,
        ipAddress: getClientIp(ctx.headers),
        userAgent: ctx.headers?.get('user-agent'),
      });
      return;
    }

    if (!session.activeOrganizationId || session.deviceAgent) return;
    const org = await db.organization.findUnique({
      where: { id: session.activeOrganizationId },
      select: { sessionIdleTimeoutMinutes: true },
    });
    await revokeIfIdle({
      session,
      organizationId: session.activeOrganizationId,
      timeoutMinutes: org?.sessionIdleTimeoutMinutes,
      path: ctx.path,
    });
  } catch (err) {
    console.error('[Auth] Session before-hook failed:', err);
  }
}

function readEmail(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('email' in body)) return null;
  const email = (body as { email?: unknown }).email;
  return typeof email === 'string' ? email.toLowerCase().trim() : null;
}
