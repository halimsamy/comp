import { BadRequestException, CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';

jest.mock('../auth/auth.server', () => ({ auth: { api: { hasPermission: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {},
  RESTRICTED_ROLES: [],
  PRIVILEGED_ROLES: [],
}));

const mockCreate = jest.fn();
const mockOrgFindUnique = jest.fn();
jest.mock('@db', () => ({
  db: {
    auditLog: { create: (...a: unknown[]) => mockCreate(...a) },
    organization: { findUnique: (...a: unknown[]) => mockOrgFindUnique(...a) },
    member: { findMany: jest.fn().mockResolvedValue([]) },
  },
  AuditLogEntityType: {
    organization: 'organization',
    framework: 'framework',
    people: 'people',
    integration: 'integration',
    policy: 'policy',
  },
  CommentEntityType: {},
  Prisma: {},
}));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { routeLabel } from './audit-log.request-meta';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(permission: { resource: string; actions: string[] }) {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => (key === PERMISSIONS_KEY ? [permission] : undefined));
  const interceptor = new AuditLogInterceptor(reflector, {
    resolve: jest.fn(),
  } as never);
  return interceptor;
}

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        organizationId: 'org_1',
        userId: 'usr_1',
        memberId: 'mem_1',
        params: {},
        headers: {},
        ...request,
      }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

const handler = (response: unknown): CallHandler => ({ handle: () => of(response) });
const loggedRow = () => mockCreate.mock.calls[0][0].data;

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({});
  mockOrgFindUnique.mockReset();
});

describe('AuditLogInterceptor request metadata', () => {
  it('records the client IP (first x-forwarded-for hop) and user agent on every row', async () => {
    const interceptor = setup({ resource: 'policy', actions: ['update'] });
    const ctx = context({
      method: 'POST',
      url: '/v1/policies',
      body: { name: 'Access Control' },
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Mozilla/5.0' },
      ip: '10.0.0.9',
    });
    await lastValueFrom(interceptor.intercept(ctx, handler({ id: 'pol_1', name: 'Access Control' })));
    await flush();

    expect(loggedRow().data).toMatchObject({
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      entityName: 'Access Control',
    });
    expect(loggedRow().data.searchText).toContain('access control');
  });

  it('falls back to req.ip without a forwarded header', async () => {
    const interceptor = setup({ resource: 'policy', actions: ['update'] });
    const ctx = context({ method: 'POST', url: '/v1/policies', body: {}, ip: '10.0.0.9' });
    await lastValueFrom(interceptor.intercept(ctx, handler({ id: 'pol_1' })));
    await flush();
    expect(loggedRow().data.ipAddress).toBe('10.0.0.9');
  });

  it('logs a failed mutation with its status code and still rethrows', async () => {
    const interceptor = setup({ resource: 'policy', actions: ['update'] });
    const ctx = context({ method: 'DELETE', url: '/v1/policies/pol_1', params: { id: 'pol_1' } });
    const failing: CallHandler = {
      handle: () => throwError(() => new BadRequestException('nope')),
    };

    await expect(lastValueFrom(interceptor.intercept(ctx, failing))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await flush();

    expect(loggedRow().description).toBe('Failed: Deleted policy');
    expect(loggedRow().data).toMatchObject({ outcome: 'failure', statusCode: 400 });
  });

  it('labels routes whose permission resource is generic', async () => {
    const interceptor = setup({ resource: 'member', actions: ['update'] });
    const ctx = context({ method: 'POST', url: '/v1/access-reviews', body: { name: 'Q4' } });
    await lastValueFrom(interceptor.intercept(ctx, handler({ id: 'arv_1', name: 'Q4' })));
    await flush();

    expect(loggedRow().description).toBe('Created access review');
    expect(loggedRow().entityType).toBe('people');
    expect(loggedRow().data.resource).toBe('access-reviews');
  });

  it('logs audit and SoA changes even though they use the audit permission', async () => {
    const interceptor = setup({ resource: 'audit', actions: ['update'] });
    await lastValueFrom(
      interceptor.intercept(
        context({ method: 'POST', url: '/v1/soa/save-answer', body: { answer: 'yes' } }),
        handler({ ok: true }),
      ),
    );
    await flush();
    expect(loggedRow().data.resource).toBe('soa');

    mockCreate.mockClear();
    await lastValueFrom(
      interceptor.intercept(
        context({ method: 'POST', url: '/v1/audit-logs/export' }),
        handler([]),
      ),
    );
    await flush();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('diffs security settings against the previous organization values', async () => {
    mockOrgFindUnique.mockResolvedValue({ sessionIdleTimeoutMinutes: 30 });
    const interceptor = setup({ resource: 'organization', actions: ['update'] });
    const ctx = context({
      method: 'PATCH',
      url: '/v1/security-settings',
      body: { sessionIdleTimeoutMinutes: 15 },
    });
    await lastValueFrom(interceptor.intercept(ctx, handler({ sessionIdleTimeoutMinutes: 15 })));
    await flush();

    expect(mockOrgFindUnique).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { sessionIdleTimeoutMinutes: true },
    });
    expect(loggedRow().data.changes).toEqual({
      sessionIdleTimeoutMinutes: { previous: 30, current: 15 },
    });
  });
});

describe('routeLabel', () => {
  it.each([
    ['/v1/access-reviews/arv_1/items', 'access-reviews'],
    ['/v1/assets/ast_1', 'assets'],
    ['/v1/vulnerabilities', 'vulnerabilities'],
    ['/v1/isms/documents/scope', 'isms'],
    ['/v1/roles/rol_1', 'roles'],
    ['/v1/training/complete', 'training'],
    ['/v1/audits/aud_1/requests', 'audits'],
    ['/v1/questionnaire/qst_1/approve-external', 'questionnaires'],
    ['/v1/soa/save-answer?x=1', 'soa'],
  ])('%s → %s', (path, resource) => {
    expect(routeLabel(path)?.resource).toBe(resource);
  });

  it('leaves other routes alone', () => {
    expect(routeLabel('/v1/policies/pol_1')).toBeNull();
  });
});
