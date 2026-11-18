import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const mockGetSession = jest.fn();
const mockMemberFindFirst = jest.fn();
const mockEnforceSessionPolicy = jest.fn();

jest.mock('./auth.server', () => ({
  auth: { api: { getSession: (...a: unknown[]) => mockGetSession(...a), getMcpSession: jest.fn() } },
}));
jest.mock('./api-key.service', () => ({ ApiKeyService: class {} }));
jest.mock('./app-access', () => ({ hasAppAccess: jest.fn() }));
jest.mock('./service-token.config', () => ({ resolveServiceByToken: jest.fn() }));
jest.mock('./idle-session', () => ({
  enforceSessionPolicy: (...a: unknown[]) => mockEnforceSessionPolicy(...a),
}));
jest.mock('@db', () => ({
  db: { member: { findFirst: (...a: unknown[]) => mockMemberFindFirst(...a) } },
}));

import type { ApiKeyService } from './api-key.service';
import { HybridAuthGuard } from './hybrid-auth.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('HybridAuthGuard — org session policy', () => {
  const reflector = new Reflector();
  const guard = new HybridAuthGuard({} as ApiKeyService, reflector);
  const sessionData = {
    id: 'ses_1',
    activeOrganizationId: 'org_1',
    updatedAt: new Date(),
    signInMethod: 'google',
  };
  const policy = { sessionIdleTimeoutMinutes: 15, allowedSignInMethods: ['google'] };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockGetSession.mockResolvedValue({ user: { id: 'usr_1', email: 'a@b.com' }, session: sessionData });
    mockMemberFindFirst.mockResolvedValue({
      id: 'mem_1',
      role: 'admin',
      department: 'it',
      organization: policy,
    });
  });

  it('applies the active org policy to the session', async () => {
    await expect(guard.canActivate(contextFor({ headers: { cookie: 'c=1' } }))).resolves.toBe(true);
    expect(mockMemberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          organization: {
            select: { sessionIdleTimeoutMinutes: true, allowedSignInMethods: true },
          },
        }),
      }),
    );
    expect(mockEnforceSessionPolicy).toHaveBeenCalledWith({
      session: expect.objectContaining({ id: 'ses_1', userId: 'usr_1', signInMethod: 'google' }),
      organizationId: 'org_1',
      policy,
    });
  });

  it('rejects the request when the policy rejects the session', async () => {
    mockEnforceSessionPolicy.mockRejectedValueOnce(new UnauthorizedException('idle'));
    await expect(
      guard.canActivate(contextFor({ headers: { cookie: 'c=1' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
