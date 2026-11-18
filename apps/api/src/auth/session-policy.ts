import { z } from 'zod';

/** Sign-in methods an organization can allow. Mirrors the providers in auth.server.ts. */
export const SIGN_IN_METHODS = [
  'google',
  'microsoft',
  'github',
  'magic-link',
  'email-otp',
] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

/** Idle timeout options in minutes. 15 meets PCI DSS v4.0.1 8.2.8. */
export const IDLE_TIMEOUT_OPTIONS = [15, 30, 60, 240, 480, 1440] as const;

/** How often the guard records activity on a session (one write per minute at most). */
export const SESSION_TOUCH_INTERVAL_MS = 60_000;

export const signInMethodSchema = z.enum(SIGN_IN_METHODS);

export const SIGN_IN_METHOD_LABELS: Record<SignInMethod, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  github: 'GitHub',
  'magic-link': 'magic link',
  'email-otp': 'email code',
};

const SOCIAL_PROVIDERS = new Set<string>(['google', 'microsoft', 'github']);

interface AuthEndpointContext {
  path?: string;
  params?: Record<string, string | undefined> | null;
  body?: unknown;
}

/**
 * Which method created a session, from the better-auth endpoint that is
 * creating it. Returns null for sessions created outside a sign-in endpoint
 * (device agent, impersonation), which the allowed-methods policy never blocks.
 */
export function resolveSignInMethod(
  ctx: AuthEndpointContext | null | undefined,
): SignInMethod | null {
  const path = ctx?.path;
  if (!path) return null;
  if (path === '/magic-link/verify') return 'magic-link';
  if (path === '/sign-in/email-otp') return 'email-otp';
  if (path === '/callback/:id' || path.startsWith('/callback/')) {
    return toSocialMethod(ctx?.params?.id ?? path.split('/')[2]);
  }
  if (path === '/sign-in/social') {
    const body = ctx?.body;
    const provider =
      body && typeof body === 'object' && 'provider' in body
        ? (body as { provider?: unknown }).provider
        : undefined;
    return toSocialMethod(typeof provider === 'string' ? provider : undefined);
  }
  return null;
}

function toSocialMethod(provider: string | undefined): SignInMethod | null {
  const parsed = signInMethodSchema.safeParse(provider);
  return parsed.success && SOCIAL_PROVIDERS.has(parsed.data) ? parsed.data : null;
}

/** Empty allow-list or an unknown method means the policy doesn't apply. */
export function isSignInMethodAllowed({
  allowed,
  method,
}: {
  allowed: readonly string[] | null | undefined;
  method: string | null | undefined;
}): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!method) return true;
  return allowed.includes(method);
}

export function isSessionIdle({
  lastActiveAt,
  timeoutMinutes,
  now = new Date(),
}: {
  lastActiveAt: Date | string;
  timeoutMinutes: number | null | undefined;
  now?: Date;
}): boolean {
  if (!timeoutMinutes || timeoutMinutes <= 0) return false;
  const last = new Date(lastActiveAt).getTime();
  return now.getTime() - last > timeoutMinutes * 60_000;
}

export function shouldTouchSession({
  lastActiveAt,
  now = new Date(),
}: {
  lastActiveAt: Date | string;
  now?: Date;
}): boolean {
  return now.getTime() - new Date(lastActiveAt).getTime() > SESSION_TOUCH_INTERVAL_MS;
}

export function signInMethodLabel(method: string): string {
  const parsed = signInMethodSchema.safeParse(method);
  return parsed.success ? SIGN_IN_METHOD_LABELS[parsed.data] : method;
}

export function describeAllowedMethods(allowed: readonly string[]): string {
  return allowed.map(signInMethodLabel).join(', ');
}
