import { NotFoundException } from '@nestjs/common';

const mockDb = {
  control: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  evidenceFormSetting: { findMany: jest.fn() },
  evidenceSubmission: { groupBy: jest.fn() },
  member: { findFirst: jest.fn() },
};

jest.mock('@db', () => ({
  db: new Proxy({}, { get: (_t, prop: string) => mockDb[prop as keyof typeof mockDb] }),
  Prisma: {},
}));

import { ControlsOverviewService, controlEvidenceStatus } from './controls-overview.service';

const control = {
  id: 'ctl_1',
  name: 'Access Rights',
  description: 'd',
  owner: null,
  requirementsMapped: [
    {
      frameworkInstanceId: 'frm_pci',
      frameworkInstance: { framework: { name: 'PCI DSS' }, customFramework: null },
      requirement: { identifier: '7.2.1', name: 'r' },
      customRequirement: null,
    },
  ],
  policies: [{ id: 'pol_1', status: 'published' }],
  frameworkPolicyLinks: [{ policy: { id: 'pol_1', status: 'published' } }, { policy: { id: 'pol_2', status: 'draft' } }],
  tasks: [{ id: 'tsk_1', status: 'done' }],
  frameworkTaskLinks: [],
  controlDocumentTypes: [{ formType: 'access_request' }, { formType: 'rbac_matrix' }],
  frameworkDocumentLinks: [{ formType: 'account_types' }],
  ismsDocumentLinks: [{ ismsDocument: { id: 'doc', status: 'draft', currentVersionId: 'v1' } }],
};

describe('controlEvidenceStatus', () => {
  it('maps tallies to a status', () => {
    expect(controlEvidenceStatus([])).toBe('no_evidence');
    expect(controlEvidenceStatus([{ total: 2, completed: 0 }])).toBe('not_started');
    expect(controlEvidenceStatus([{ total: 2, completed: 1 }])).toBe('in_progress');
    expect(controlEvidenceStatus([{ total: 2, completed: 2 }, { total: 0, completed: 0 }])).toBe('completed');
  });
});

describe('ControlsOverviewService', () => {
  const service = new ControlsOverviewService();

  beforeEach(() => jest.clearAllMocks());

  it('unions both link kinds and scores evidence per kind', async () => {
    mockDb.control.findMany.mockResolvedValue([control]);
    mockDb.evidenceFormSetting.findMany.mockResolvedValue([{ formType: 'rbac_matrix' }]);
    mockDb.evidenceSubmission.groupBy.mockResolvedValue([
      { formType: 'access_request', _max: { submittedAt: new Date() } },
      { formType: 'account_types', _max: { submittedAt: new Date('2020-01-01') } },
    ]);

    const { data } = await service.list('org_1');

    expect(mockDb.evidenceSubmission.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1', status: { not: 'rejected' } } }),
    );
    expect(data[0].evidence).toEqual({
      policies: { total: 2, completed: 1 },
      tasks: { total: 1, completed: 1 },
      forms: { total: 2, completed: 1 }, // rbac_matrix is not relevant; account_types is stale
      ismsDocuments: { total: 1, completed: 1 },
    });
    expect(data[0].status).toBe('in_progress');
    expect(data[0].frameworks[0].requirements[0].identifier).toBe('7.2.1');
  });

  it('refuses an owner from another org', async () => {
    mockDb.control.findFirst.mockResolvedValue({ id: 'ctl_1' });
    mockDb.member.findFirst.mockResolvedValue(null);
    await expect(
      service.setOwner({ organizationId: 'org_1', controlId: 'ctl_1', ownerId: 'mem_x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockDb.control.update).not.toHaveBeenCalled();
  });

  it('clears the owner with null', async () => {
    mockDb.control.findFirst.mockResolvedValue({ id: 'ctl_1' });
    mockDb.control.update.mockResolvedValue({ id: 'ctl_1', owner: null });
    const result = await service.setOwner({ organizationId: 'org_1', controlId: 'ctl_1', ownerId: null });
    expect(mockDb.member.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'ctl_1', owner: null });
  });
});
