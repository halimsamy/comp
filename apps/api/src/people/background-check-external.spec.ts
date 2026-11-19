const mockDb = {
  member: { findMany: jest.fn() },
  backgroundCheckRequest: { upsert: jest.fn().mockResolvedValue({ id: 'bcr_1' }) },
};
jest.mock('@db', () => ({ db: mockDb }));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { verifyBackgroundExternally } from './background-check-external';
import { PeopleBackgroundCheckController } from './people-background-check.controller';

jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));

describe('verifyBackgroundExternally (#179)', () => {
  const attachments = { uploadAttachment: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.member.findMany.mockResolvedValue([
      { id: 'mem_1', user: { name: 'Ada', email: 'ada@acme.com' }, backgroundCheckRequests: [] },
      { id: 'mem_2', user: { name: 'Bo', email: 'bo@acme.com' }, backgroundCheckRequests: [{ status: 'completed' }] },
    ]);
  });

  it('completes pending checks with the provider and date, skipping completed ones', async () => {
    const result = await verifyBackgroundExternally({
      organizationId: 'org_1',
      userId: 'usr_1',
      dto: {
        memberIds: ['mem_1', 'mem_2'],
        provider: 'Sterling',
        verifiedAt: '2026-03-01',
        fileName: 'report.pdf',
        fileType: 'application/pdf',
        fileData: 'aGk=',
      },
      attachments: attachments as never,
    });
    expect(result).toEqual({ verified: 1, skipped: 1 });
    expect(mockDb.member.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['mem_1', 'mem_2'] },
      organizationId: 'org_1',
      deactivated: false,
    });
    expect(mockDb.backgroundCheckRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          memberId: 'mem_1',
          status: 'completed',
          completedAt: new Date('2026-03-01'),
          requesterNotes: 'Verified externally by Sterling',
        }),
      }),
    );
    expect(attachments.uploadAttachment).toHaveBeenCalledWith('org_1', 'bcr_1', 'background_check', expect.anything(), 'usr_1');
  });

  it('rejects a future date', async () => {
    await expect(
      verifyBackgroundExternally({
        organizationId: 'org_1',
        dto: { memberIds: ['mem_1'], provider: 'X', verifiedAt: '2999-01-01' },
        attachments: attachments as never,
      }),
    ).rejects.toThrow('cannot be in the future');
  });

  it('requires member:update', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, PeopleBackgroundCheckController.prototype.verifyExternally),
    ).toEqual([{ resource: 'member', actions: ['update'] }]);
  });
});
