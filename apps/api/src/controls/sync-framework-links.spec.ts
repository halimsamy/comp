import {
  syncControlsToAllFrameworks,
  syncDirectLinksToAllFrameworks,
} from './sync-framework-links';

const mockDb = {
  requirementMap: { findMany: jest.fn() },
  control: { findUnique: jest.fn() },
  frameworkControlPolicyLink: { createMany: jest.fn() },
  frameworkControlTaskLink: { createMany: jest.fn() },
  frameworkControlDocumentTypeLink: { createMany: jest.fn() },
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockDb)),
};

jest.mock('@db', () => ({
  db: new Proxy({}, { get: (_t, prop: string) => mockDb[prop as keyof typeof mockDb] }),
  Prisma: {},
}));

describe('syncDirectLinksToAllFrameworks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does nothing when no framework maps the control', async () => {
    mockDb.requirementMap.findMany.mockResolvedValue([]);

    await syncDirectLinksToAllFrameworks({ controlId: 'ctl_1', organizationId: 'org_1' });

    expect(mockDb.control.findUnique).not.toHaveBeenCalled();
  });

  it('queries every framework instance in the org, platform and custom alike', async () => {
    mockDb.requirementMap.findMany.mockResolvedValue([]);

    await syncDirectLinksToAllFrameworks({ controlId: 'ctl_1', organizationId: 'org_1' });

    expect(mockDb.requirementMap.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          controlId: 'ctl_1',
          archivedAt: null,
          frameworkInstance: { organizationId: 'org_1' },
        },
      }),
    );
  });

  it('fans direct links out to ISO and PCI instances', async () => {
    mockDb.requirementMap.findMany.mockResolvedValue([
      { frameworkInstanceId: 'frm_iso' },
      { frameworkInstanceId: 'frm_pci' },
    ]);
    mockDb.control.findUnique.mockResolvedValue({
      id: 'ctl_1',
      policies: [{ id: 'pol_a' }],
      tasks: [{ id: 'tsk_a' }],
      controlDocumentTypes: [{ formType: 'access-request' }],
    });

    await syncDirectLinksToAllFrameworks({ controlId: 'ctl_1', organizationId: 'org_1' });

    expect(mockDb.frameworkControlPolicyLink.createMany).toHaveBeenCalledWith({
      data: [
        { frameworkInstanceId: 'frm_iso', controlId: 'ctl_1', policyId: 'pol_a' },
        { frameworkInstanceId: 'frm_pci', controlId: 'ctl_1', policyId: 'pol_a' },
      ],
      skipDuplicates: true,
    });
    expect(mockDb.frameworkControlTaskLink.createMany).toHaveBeenCalledWith({
      data: [
        { frameworkInstanceId: 'frm_iso', controlId: 'ctl_1', taskId: 'tsk_a' },
        { frameworkInstanceId: 'frm_pci', controlId: 'ctl_1', taskId: 'tsk_a' },
      ],
      skipDuplicates: true,
    });
    expect(mockDb.frameworkControlDocumentTypeLink.createMany).toHaveBeenCalledWith({
      data: [
        { frameworkInstanceId: 'frm_iso', controlId: 'ctl_1', formType: 'access-request' },
        { frameworkInstanceId: 'frm_pci', controlId: 'ctl_1', formType: 'access-request' },
      ],
      skipDuplicates: true,
    });
  });

  it('skips empty relationships', async () => {
    mockDb.requirementMap.findMany.mockResolvedValue([{ frameworkInstanceId: 'frm_iso' }]);
    mockDb.control.findUnique.mockResolvedValue({
      id: 'ctl_1',
      policies: [],
      tasks: [],
      controlDocumentTypes: [],
    });

    await syncDirectLinksToAllFrameworks({ controlId: 'ctl_1', organizationId: 'org_1' });

    expect(mockDb.frameworkControlPolicyLink.createMany).not.toHaveBeenCalled();
    expect(mockDb.frameworkControlTaskLink.createMany).not.toHaveBeenCalled();
    expect(mockDb.frameworkControlDocumentTypeLink.createMany).not.toHaveBeenCalled();
  });

  it('uses the given transaction client instead of opening one', async () => {
    mockDb.requirementMap.findMany.mockResolvedValue([]);

    await syncDirectLinksToAllFrameworks({
      controlId: 'ctl_1',
      organizationId: 'org_1',
      client: mockDb as never,
    });

    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

describe('syncControlsToAllFrameworks', () => {
  it('syncs each distinct control once', async () => {
    jest.clearAllMocks();
    mockDb.requirementMap.findMany.mockResolvedValue([]);

    await syncControlsToAllFrameworks({
      controlIds: ['ctl_1', 'ctl_2', 'ctl_1'],
      organizationId: 'org_1',
    });

    expect(mockDb.requirementMap.findMany).toHaveBeenCalledTimes(2);
  });
});
