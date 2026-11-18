import { db } from '@db';

export type AuthEventType =
  | 'sign_in'
  | 'sign_out'
  | 'sign_in_failed'
  | 'session_idle_expired';

export interface RecordAuthEventInput {
  userId: string;
  event: AuthEventType;
  description: string;
  path: string;
  signInMethod?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Limit the event to one org. Omit to record it in every org the user is an active member of. */
  organizationId?: string | null;
}

/**
 * Write a sign-in / sign-out / session event to the org audit log (ISO 27001
 * A.8.15, PCI DSS 10.2.1.4 and 10.2.1.5). A user's login is recorded in each
 * organization they belong to, so every tenant sees its own members' access.
 * Never throws: an audit write must not break authentication.
 */
export async function recordAuthEvent(input: RecordAuthEventInput): Promise<void> {
  try {
    const memberships = await db.member.findMany({
      where: {
        userId: input.userId,
        deactivated: false,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      },
      select: { id: true, organizationId: true },
    });
    if (memberships.length === 0) return;

    await db.auditLog.createMany({
      data: memberships.map((m) => ({
        organizationId: m.organizationId,
        userId: input.userId,
        memberId: m.id,
        entityType: null,
        entityId: null,
        description: input.description,
        data: {
          action: input.description,
          method: 'POST',
          path: input.path,
          resource: 'auth',
          permission: input.event,
          ...(input.signInMethod ? { signInMethod: input.signInMethod } : {}),
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        },
      })),
    });
  } catch (err) {
    console.error('[Auth] Failed to write auth audit event:', err);
  }
}

export function getClientIp(headers: Headers | undefined | null): string | null {
  if (!headers) return null;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || null;
  return headers.get('x-real-ip');
}
