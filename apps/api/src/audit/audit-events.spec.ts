import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const mockFindMany = jest.fn();
const mockCount = jest.fn();
jest.mock('@db', () => ({
  db: {
    auditLog: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      count: (...a: unknown[]) => mockCount(...a),
    },
  },
}));
jest.mock('../auth/auth.server', () => ({ auth: { api: {} } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { AuditEventsController, AUDIT_EVENT_EXPORT_LIMIT } from './audit-events.controller';
import {
  AuditEventsQueryDto,
  auditEventsToCsv,
  buildAuditEventsWhere,
} from './audit-events.query';

const authContext = {
  organizationId: 'org_1',
  authType: 'session' as const,
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['admin'],
  userId: 'usr_1',
  userEmail: 'a@b.com',
};

describe('audit events', () => {
  beforeEach(() => jest.clearAllMocks());

  it('always scopes by organization and applies filters', () => {
    const where = buildAuditEventsWhere({
      organizationId: 'org_1',
      query: { userId: 'usr_2', resource: 'auth', from: '2026-01-01', to: '2026-01-31', search: 'sign' },
    });
    expect(where).toMatchObject({
      organizationId: 'org_1',
      userId: 'usr_2',
      data: { path: ['resource'], equals: 'auth' },
      description: { contains: 'sign', mode: 'insensitive' },
    });
    expect(where.timestamp).toEqual({
      gte: new Date('2026-01-01'),
      lte: new Date('2026-01-31T23:59:59.999Z'),
    });
  });

  it('with no filters returns only the org scope', () => {
    expect(buildAuditEventsWhere({ organizationId: 'org_1', query: {} })).toEqual({
      organizationId: 'org_1',
    });
  });

  it('validates query params', async () => {
    const bad = plainToInstance(AuditEventsQueryDto, { from: 'not-a-date', take: '500' });
    const errors = await validate(bad);
    expect(errors.map((e) => e.property).sort()).toEqual(['from', 'take']);
    const good = plainToInstance(AuditEventsQueryDto, { take: '20', offset: '40' });
    expect(await validate(good)).toHaveLength(0);
    expect(good.take).toBe(20);
  });

  it('renders formula-safe CSV with sign-in details', () => {
    const csv = auditEventsToCsv([
      {
        id: 'aud_1',
        timestamp: new Date('2026-11-18T10:00:00Z'),
        description: '=cmd() Signed in with Google',
        entityType: null,
        entityId: null,
        data: { resource: 'auth', ipAddress: '1.2.3.4', signInMethod: 'google', method: 'POST' },
        user: { name: 'Ann', email: 'ann@x.com' },
      },
    ]);
    const [header, row] = csv.split('\n');
    expect(header).toContain('"Sign-in method"');
    expect(row).toContain('"2026-11-18T10:00:00.000Z"');
    expect(row).toContain('"1.2.3.4"');
    expect(row).not.toContain('"=cmd()');
  });

  it('requires audit:read on both endpoints', () => {
    for (const name of ['listAuditEvents', 'exportAuditEvents'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, AuditEventsController.prototype[name])).toEqual([
        { resource: 'audit', actions: ['read'] },
      ]);
    }
  });

  it('lists events for the caller org with paging', async () => {
    mockFindMany.mockResolvedValue([{ id: 'aud_1' }]);
    mockCount.mockResolvedValue(1);
    const res = await new AuditEventsController().listAuditEvents('org_1', authContext, {
      take: 10,
      offset: 20,
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1' }, take: 10, skip: 20 }),
    );
    expect(res).toMatchObject({ data: [{ id: 'aud_1' }], count: 1 });
  });

  it('exports CSV for the caller org', async () => {
    mockFindMany.mockResolvedValue([]);
    const res = { setHeader: jest.fn(), send: jest.fn() };
    await new AuditEventsController().exportAuditEvents('org_1', {}, res as never);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1' }, take: AUDIT_EVENT_EXPORT_LIMIT }),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/event-log-\d{4}-\d{2}-\d{2}\.csv/),
    );
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Timestamp (UTC)'));
  });
});
