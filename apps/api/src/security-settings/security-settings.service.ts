import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import {
  IDLE_TIMEOUT_OPTIONS,
  SIGN_IN_METHOD_LABELS,
  signInMethodLabel,
  type SignInMethod,
} from '../auth/session-policy';
import type { UpdateSecuritySettingsDto } from './dto/update-security-settings.dto';

const SECURITY_SELECT = {
  sessionIdleTimeoutMinutes: true,
  allowedSignInMethods: true,
} as const;

/** Sign-in methods this deployment actually offers (social providers need env credentials). */
export function getAvailableSignInMethods(
  env: NodeJS.ProcessEnv = process.env,
): SignInMethod[] {
  const methods: SignInMethod[] = [];
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) methods.push('google');
  if (env.AUTH_MICROSOFT_CLIENT_ID && env.AUTH_MICROSOFT_CLIENT_SECRET) {
    methods.push('microsoft');
  }
  if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) methods.push('github');
  methods.push('magic-link', 'email-otp');
  return methods;
}

@Injectable()
export class SecuritySettingsService {
  async get(organizationId: string) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: SECURITY_SELECT,
    });
    if (!org) throw new NotFoundException('Organization not found');
    return {
      ...org,
      idleTimeoutOptions: [...IDLE_TIMEOUT_OPTIONS],
      availableSignInMethods: getAvailableSignInMethods().map((id) => ({
        id,
        label: SIGN_IN_METHOD_LABELS[id],
      })),
    };
  }

  async getSessionPolicy(organizationId: string) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { sessionIdleTimeoutMinutes: true },
    });
    return { sessionIdleTimeoutMinutes: org?.sessionIdleTimeoutMinutes ?? null };
  }

  async update({
    organizationId,
    sessionId,
    dto,
  }: {
    organizationId: string;
    sessionId?: string;
    dto: UpdateSecuritySettingsDto;
  }) {
    if (dto.allowedSignInMethods?.length) {
      await this.assertCallerKeepsAccess({
        sessionId,
        allowed: dto.allowedSignInMethods,
      });
    }

    await db.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.sessionIdleTimeoutMinutes !== undefined && {
          sessionIdleTimeoutMinutes: dto.sessionIdleTimeoutMinutes,
        }),
        ...(dto.allowedSignInMethods !== undefined && {
          allowedSignInMethods: dto.allowedSignInMethods,
        }),
      },
    });
    return this.get(organizationId);
  }

  /** Refuse a change that would lock the admin making it out of their own session. */
  private async assertCallerKeepsAccess({
    sessionId,
    allowed,
  }: {
    sessionId?: string;
    allowed: string[];
  }) {
    if (!sessionId) return;
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: { signInMethod: true },
    });
    const method = session?.signInMethod;
    if (!method || allowed.includes(method)) return;
    throw new BadRequestException(
      `You signed in with ${signInMethodLabel(method)}. Keep it allowed, or sign in with an allowed method first, so you don't lock yourself out.`,
    );
  }
}
