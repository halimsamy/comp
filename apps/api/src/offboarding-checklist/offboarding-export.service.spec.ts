import { PassThrough } from 'stream';

const mockDb = {
  attachment: {
    findFirst: jest.fn(),
  },
  member: {
    findMany: jest.fn(),
  },
};

jest.mock('@db', () => ({
  db: mockDb,
  AttachmentEntityType: {
    offboarding_checklist: 'offboarding_checklist',
  },
}));

jest.mock('archiver', () => {
  const mockArchive = {
    pipe: jest.fn(),
    on: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
  };
  return jest.fn(() => mockArchive);
});

import archiver from 'archiver';
import { OffboardingExportService } from './offboarding-export.service';

const row = (over: Record<string, unknown>) => ({
  systemKey: 'connection:slack',
  name: 'Slack',
  kind: 'inventory',
  accounts: [{ accountId: 'u1', name: 'bob', status: 'suspended', roles: [] }],
  revoked: true,
  stillActive: false,
  revokedAt: new Date('2026-05-01'),
  revokedBy: { name: 'Jane Doe' },
  notes: null,
  evidence: [],
  ...over,
});

describe('OffboardingExportService', () => {
  const mockAttachmentsService = {
    getObjectBuffer: jest.fn(),
  };

  const mockAccessRevocationService = {
    getAccessRevocations: jest.fn(),
  };

  const mockChecklistService = {
    getMemberChecklist: jest.fn(),
  };

  let service: OffboardingExportService;
  let mockArchive: ReturnType<typeof archiver>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OffboardingExportService(
      mockAttachmentsService as never,
      mockAccessRevocationService as never,
      mockChecklistService as never,
    );
    mockArchive = (archiver as unknown as jest.Mock)();
  });

  it('creates a zip with summary CSV and vendor revocations CSV', async () => {
    mockChecklistService.getMemberChecklist.mockResolvedValue({
      items: [
        {
          title: 'Revoke system access',
          completed: true,
          completion: {
            completedBy: { name: 'Jane Doe' },
            completedAt: new Date('2026-05-01'),
          },
          evidence: [],
        },
        {
          title: 'Recover devices',
          completed: false,
          completion: null,
          evidence: [],
        },
      ],
      totalItems: 2,
      completedItems: 1,
    });

    mockAccessRevocationService.getAccessRevocations.mockResolvedValue({
      systems: [row({})],
      vendors: [
        row({ systemKey: 'vendor:v1', name: 'Zoom', kind: 'vendor', accounts: [], revoked: false }),
      ],
    });

    const output = new PassThrough();

    await service.exportMemberEvidence({
      organizationId: 'org_1',
      memberId: 'mem_1',
      output,
    });

    expect(archiver).toHaveBeenCalledWith('zip', { zlib: { level: 9 } });
    expect(mockArchive.pipe).toHaveBeenCalledWith(output);
    expect(mockArchive.finalize).toHaveBeenCalled();

    const appendCalls = (mockArchive.append as jest.Mock).mock.calls;
    expect(appendCalls).toHaveLength(2);

    // Summary CSV
    const summaryCsv = appendCalls[0][0] as string;
    expect(summaryCsv).toContain('Item,Status,Completed By');
    expect(summaryCsv).toContain('"Revoke system access",Complete,"Jane Doe"');
    expect(summaryCsv).toContain('"Recover devices",Pending,""');
    expect(appendCalls[0][1]).toEqual({ name: 'summary.csv' });

    // Access revocations CSV: inventory systems; unconfirmed vendor fallbacks are left out.
    const accessCsv = appendCalls[1][0] as string;
    expect(accessCsv).toContain('System,Source,Accounts,Status,Confirmed By,Date,Notes,Has Evidence');
    expect(accessCsv).toContain(
      '"Slack","Access inventory","bob (suspended)","Revoked","Jane Doe",2026-05-01,"",No',
    );
    expect(accessCsv).not.toContain('Zoom');
    expect(appendCalls[1][1]).toEqual({
      name: 'access-revocations/access-revocations.csv',
    });
  });

  it('includes vendor evidence files from S3', async () => {
    mockChecklistService.getMemberChecklist.mockResolvedValue({
      items: [],
      totalItems: 0,
      completedItems: 0,
    });

    mockAccessRevocationService.getAccessRevocations.mockResolvedValue({
      systems: [row({ name: 'AWS', evidence: [{ id: 'att_1', name: 'aws-disable.png' }] })],
      vendors: [],
    });

    mockDb.attachment.findFirst.mockResolvedValue({
      id: 'att_1',
      url: 'org_1/attachments/offboarding/aws-disable.png',
    });
    mockAttachmentsService.getObjectBuffer.mockResolvedValue(
      Buffer.from('fake-png-data'),
    );

    const output = new PassThrough();
    await service.exportMemberEvidence({
      organizationId: 'org_1',
      memberId: 'mem_1',
      output,
    });

    const appendCalls = (mockArchive.append as jest.Mock).mock.calls;
    const evidenceCall = appendCalls.find(
      (c: unknown[]) =>
        (c[1] as { name: string }).name ===
        'access-revocations/evidence/att_1-aws-disable.png',
    );
    expect(evidenceCall).toBeDefined();
    expect(Buffer.isBuffer(evidenceCall[0])).toBe(true);
  });

  it('includes checklist item evidence in numbered folders', async () => {
    mockChecklistService.getMemberChecklist.mockResolvedValue({
      items: [
        {
          title: 'Recover devices',
          completed: true,
          completion: {
            completedBy: { name: 'Jane' },
            completedAt: new Date(),
          },
          evidence: [{ id: 'att_2', name: 'device-receipt.pdf' }],
        },
      ],
      totalItems: 1,
      completedItems: 1,
    });

    mockAccessRevocationService.getAccessRevocations.mockResolvedValue({
      systems: [],
      vendors: [],
    });

    mockDb.attachment.findFirst.mockResolvedValue({
      id: 'att_2',
      url: 'org_1/attachments/offboarding/device-receipt.pdf',
    });
    mockAttachmentsService.getObjectBuffer.mockResolvedValue(
      Buffer.from('fake-pdf-data'),
    );

    const output = new PassThrough();
    await service.exportMemberEvidence({
      organizationId: 'org_1',
      memberId: 'mem_1',
      output,
    });

    const appendCalls = (mockArchive.append as jest.Mock).mock.calls;
    const evidenceCall = appendCalls.find(
      (c: unknown[]) =>
        (c[1] as { name: string }).name ===
        'checklist-items/01-recover-devices/att_2-device-receipt.pdf',
    );
    expect(evidenceCall).toBeDefined();
  });

  it('skips evidence files that fail to download', async () => {
    mockChecklistService.getMemberChecklist.mockResolvedValue({
      items: [
        {
          title: 'Task with broken evidence',
          completed: true,
          completion: {
            completedBy: { name: 'Jane' },
            completedAt: new Date(),
          },
          evidence: [{ id: 'att_bad', name: 'missing.pdf' }],
        },
      ],
      totalItems: 1,
      completedItems: 1,
    });

    mockAccessRevocationService.getAccessRevocations.mockResolvedValue({
      systems: [],
      vendors: [],
    });

    mockDb.attachment.findFirst.mockResolvedValue(null);

    const output = new PassThrough();
    await service.exportMemberEvidence({
      organizationId: 'org_1',
      memberId: 'mem_1',
      output,
    });

    // Should have only 2 appends: summary CSV + access revocations CSV (no evidence files)
    const appendCalls = (mockArchive.append as jest.Mock).mock.calls;
    expect(appendCalls).toHaveLength(2);
    expect(mockArchive.finalize).toHaveBeenCalled();
  });

  it('appends every offboarding under a prefix into an archive it does not own', async () => {
    mockDb.member.findMany.mockResolvedValue([
      {
        id: 'mem_1',
        deactivated: false,
        offboardDate: new Date('2026-05-01'),
        user: { name: 'Bob Smith', email: 'bob@test' },
      },
    ]);
    mockChecklistService.getMemberChecklist.mockResolvedValue({ items: [] });
    mockAccessRevocationService.getAccessRevocations.mockResolvedValue({ systems: [], vendors: [] });

    await service.appendAllOffboardings({
      archive: mockArchive,
      organizationId: 'org_1',
      prefix: 'root/Offboarding evidence/',
    });

    expect(mockDb.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org_1', offboardDate: { not: null } },
      }),
    );
    const names = (mockArchive.append as jest.Mock).mock.calls.map(
      ([, options]: [unknown, { name: string }]) => options.name,
    );
    expect(names).toEqual([
      'root/Offboarding evidence/offboarded-employees/bob-smith-mem_1/summary.csv',
      'root/Offboarding evidence/offboarded-employees/bob-smith-mem_1/access-revocations/access-revocations.csv',
      'root/Offboarding evidence/offboarding-register.csv',
    ]);
    // #85: everyone with an offboard date is in the register, deactivated or not yet.
    const register = (mockArchive.append as jest.Mock).mock.calls.at(-1)[0] as string;
    expect(register).toContain('"Bob Smith","bob@test","2026-05-01","Active"');
    expect(mockArchive.finalize).not.toHaveBeenCalled();
  });
});
