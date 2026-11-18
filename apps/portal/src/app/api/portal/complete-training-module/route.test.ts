import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  memberFindFirst: vi.fn(),
  moduleFindFirst: vi.fn(),
  recordCreate: vi.fn(),
}));

vi.mock('@/app/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@db', () => ({ Departments: { none: 'none', it: 'it' } }));
vi.mock('@db/server', () => ({
  db: {
    member: { findFirst: mocks.memberFindFirst },
    trainingModule: { findFirst: mocks.moduleFindFirst },
    trainingCompletionRecord: { create: mocks.recordCreate },
  },
}));

import { POST } from './route';

const request = (body: unknown) =>
  new NextRequest('http://portal.test/api/portal/complete-training-module', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('POST /api/portal/complete-training-module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: 'usr_1' } });
    mocks.memberFindFirst.mockResolvedValue({ id: 'mem_1', role: 'employee', department: 'it' });
    mocks.moduleFindFirst.mockResolvedValue({ id: 'trm_1', recurrenceMonths: 12 });
    mocks.recordCreate.mockImplementation(({ data }) => data);
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await POST(request({ moduleId: 'trm_1', organizationId: 'org_1' }));
    expect(res.status).toBe(401);
  });

  it('rejects non-members', async () => {
    mocks.memberFindFirst.mockResolvedValue(null);
    const res = await POST(request({ moduleId: 'trm_1', organizationId: 'org_1' }));
    expect(res.status).toBe(403);
  });

  it('rejects modules not assigned to the member', async () => {
    mocks.moduleFindFirst.mockResolvedValue(null);
    const res = await POST(request({ moduleId: 'trm_x', organizationId: 'org_1' }));
    expect(res.status).toBe(404);
    expect(mocks.recordCreate).not.toHaveBeenCalled();
  });

  it('records a completion that expires after the module recurrence', async () => {
    const res = await POST(request({ moduleId: 'trm_1', organizationId: 'org_1' }));
    expect(res.status).toBe(200);
    const data = mocks.recordCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ organizationId: 'org_1', memberId: 'mem_1', moduleId: 'trm_1' });
    const months =
      (data.expiresAt.getFullYear() - data.completedAt.getFullYear()) * 12 +
      data.expiresAt.getMonth() -
      data.completedAt.getMonth();
    expect(months).toBe(12);
    expect(mocks.moduleFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 'trm_1',
      organizationId: 'org_1',
      isEnabled: true,
    });
  });

  it('rejects invalid bodies', async () => {
    const res = await POST(request({ organizationId: 'org_1' }));
    expect(res.status).toBe(400);
  });
});
