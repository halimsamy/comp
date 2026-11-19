const mockDb = {
  member: { findFirst: jest.fn() },
  vendor: { findMany: jest.fn() },
  offboardingAccessRevocation: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    delete: jest.fn(),
  },
  attachment: { findMany: jest.fn() },
  offboardingChecklistTemplate: { findFirst: jest.fn() },
  offboardingChecklistCompletion: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
};

jest.mock('@db', () => ({
  db: mockDb,
  AttachmentEntityType: { offboarding_checklist: 'offboarding_checklist' },
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
jest.mock('@trycompai/integration-platform', () => ({
  TASK_TEMPLATES: { employeeAccess: 'frk_tt_ea' },
}));

import { AUTO_REVOKED_NOTE, AccessRevocationService } from './access-revocation.service';

const ORG = 'org_1';
const MEMBER = 'mem_leaver';
const account = (accountId: string, status: string, memberId = MEMBER) => ({
  accountId,
  name: accountId,
  status,
  roles: [],
  owner: { memberId },
});

describe('AccessRevocationService (offboarding from the access inventory, #82)', () => {
  const attachments = {
    getPresignedDownloadUrl: jest.fn(),
    uploadAttachment: jest.fn(),
    getAttachments: jest.fn().mockResolvedValue([]),
    deleteAttachment: jest.fn(),
  };
  const accounts = { listAllAccounts: jest.fn() };
  const service = new AccessRevocationService(attachments as never, accounts as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.member.findFirst.mockResolvedValue({ id: MEMBER, offboardDate: new Date() });
    mockDb.attachment.findMany.mockResolvedValue([]);
    mockDb.offboardingChecklistTemplate.findFirst.mockResolvedValue({ id: 'oct_revoke' });
    mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue(null);
    mockDb.vendor.findMany.mockResolvedValue([
      { id: 'vnd_gws', name: 'Google Workspace', website: null, logoUrl: null },
      { id: 'vnd_slack', name: 'Slack', website: null, logoUrl: null },
    ]);
    accounts.listAllAccounts.mockResolvedValue([
      {
        system: { key: 'connection:gws', name: 'Google Workspace', logoUrl: null },
        accounts: [account('leaver@acme.com', 'suspended'), account('other@acme.com', 'active', 'mem_other')],
      },
      {
        system: { key: 'manual:bank', name: 'Bank portal', logoUrl: null },
        accounts: [account('leaver', 'active')],
      },
    ]);
  });

  it('lists the leaver’s inventory systems, with uncovered vendors as optional', async () => {
    mockDb.offboardingAccessRevocation.findMany.mockResolvedValue([]);
    const result = await service.getAccessRevocations(ORG, MEMBER);
    expect(accounts.listAllAccounts).toHaveBeenCalledWith(ORG);
    expect(result.systems.map((s) => s.systemKey)).toEqual(['connection:gws', 'manual:bank']);
    expect(result.systems[0].accounts).toHaveLength(1);
    // Google Workspace is covered by the inventory; Slack is a fallback.
    expect(result.vendors?.map((v) => v.systemKey)).toEqual(['vendor:vnd_slack']);
    expect(result.vendors?.[0].optional).toBe(true);
  });

  it('auto-revokes systems whose accounts are all disabled', async () => {
    mockDb.offboardingAccessRevocation.findMany.mockResolvedValue([]);
    await service.getAccessRevocations(ORG, MEMBER);
    expect(mockDb.offboardingAccessRevocation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organizationId: ORG,
          memberId: MEMBER,
          systemKey: 'connection:gws',
          notes: AUTO_REVOKED_NOTE,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('completes "Revoke system access" once every inventory system is revoked and inactive', async () => {
    accounts.listAllAccounts.mockResolvedValue([
      {
        system: { key: 'connection:gws', name: 'Google Workspace', logoUrl: null },
        accounts: [account('leaver@acme.com', 'suspended')],
      },
    ]);
    mockDb.offboardingAccessRevocation.findMany.mockResolvedValue([
      {
        id: 'oar_1',
        systemKey: 'connection:gws',
        systemName: 'Google Workspace',
        vendorId: null,
        revokedAt: new Date(),
        notes: AUTO_REVOKED_NOTE,
        revokedBy: null,
      },
    ]);
    const result = await service.getAccessRevocations(ORG, MEMBER);
    expect(result.revokedCount).toBe(1);
    expect(mockDb.offboardingChecklistCompletion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: ORG, memberId: MEMBER, templateItemId: 'oct_revoke' }),
    });
  });

  it('reports a confirmed revoke whose account is still active, and reopens the item', async () => {
    mockDb.offboardingAccessRevocation.findMany.mockResolvedValue([
      {
        id: 'oar_bank',
        systemKey: 'manual:bank',
        systemName: 'Bank portal',
        vendorId: null,
        revokedAt: new Date(),
        notes: null,
        revokedBy: null,
      },
    ]);
    mockDb.offboardingChecklistCompletion.findFirst.mockResolvedValue({ id: 'occ_1' });
    const result = await service.getAccessRevocations(ORG, MEMBER);
    const bank = result.systems.find((s) => s.systemKey === 'manual:bank');
    expect(bank?.stillActive).toBe(true);
    expect(result.stillActiveCount).toBe(1);
    expect(mockDb.offboardingChecklistCompletion.delete).toHaveBeenCalledWith({ where: { id: 'occ_1' } });
  });

  it('does not auto-revoke for someone who is not leaving', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: MEMBER, offboardDate: null });
    mockDb.offboardingAccessRevocation.findMany.mockResolvedValue([]);
    await service.getAccessRevocations(ORG, MEMBER);
    expect(mockDb.offboardingAccessRevocation.createMany).not.toHaveBeenCalled();
  });

  it('accepts a bare vendor id from older clients', async () => {
    mockDb.offboardingAccessRevocation.findMany.mockResolvedValue([]);
    mockDb.offboardingAccessRevocation.create.mockResolvedValue({ id: 'oar_2' });
    await service.revokeSystemAccess({
      organizationId: ORG,
      memberId: MEMBER,
      systemKey: 'vnd_slack',
      revokedById: 'usr_1',
    });
    expect(mockDb.offboardingAccessRevocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ systemKey: 'vendor:vnd_slack', vendorId: 'vnd_slack', systemName: 'Slack' }),
    });
  });

  it('404s for a member of another organization', async () => {
    mockDb.member.findFirst.mockResolvedValue(null);
    await expect(service.getAccessRevocations(ORG, 'mem_x')).rejects.toThrow('Member not found');
  });
});
