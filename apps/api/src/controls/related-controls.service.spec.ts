import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  policy: { findFirst: jest.fn(), update: jest.fn() },
  task: { findFirst: jest.fn(), update: jest.fn() },
  ismsDocument: { findFirst: jest.fn() },
  control: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  frameworkControlPolicyLink: { findMany: jest.fn(), deleteMany: jest.fn() },
  frameworkControlTaskLink: { findMany: jest.fn(), deleteMany: jest.fn() },
  frameworkControlDocumentTypeLink: { findMany: jest.fn() },
  ismsDocumentControlLink: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

jest.mock('@db', () => ({
  db: new Proxy({}, { get: (_t, prop: string) => mockDb[prop as keyof typeof mockDb] }),
  EvidenceFormType: { access_request: 'access_request', rbac_matrix: 'rbac_matrix' },
  Prisma: {},
}));

import { RelatedControlsService } from './related-controls.service';
import type { ControlsService } from './controls.service';

const controlsService = {
  linkPolicies: jest.fn(),
  linkTasks: jest.fn(),
  linkDocumentTypes: jest.fn(),
  unlinkDocumentType: jest.fn(),
};

const rm = (fi: string, framework: string, identifier: string) => ({
  frameworkInstanceId: fi,
  frameworkInstance: { framework: { name: framework }, customFramework: null },
  requirement: { identifier, name: `Req ${identifier}` },
  customRequirement: null,
});

const accessRights = {
  id: 'ctl_access',
  name: 'Access Rights',
  description: '',
  owner: { id: 'mem_1', user: { name: 'Ada', email: 'ada@x.io', image: null } },
  requirementsMapped: [
    rm('frm_iso', 'ISO 27001', 'A.5.18'),
    rm('frm_iso', 'ISO 27001', 'A.5.15'),
    rm('frm_pci', 'PCI DSS', '7.2.1'),
  ],
};

describe('RelatedControlsService', () => {
  const service = new RelatedControlsService(controlsService as unknown as ControlsService);
  const org = 'org_1';

  beforeEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('shows ISO and PCI codes for a control-level policy link', async () => {
      mockDb.policy.findFirst.mockResolvedValue({ id: 'pol_1' });
      mockDb.control.findMany
        .mockResolvedValueOnce([{ id: 'ctl_access' }])
        .mockResolvedValueOnce([accessRights]);
      mockDb.frameworkControlPolicyLink.findMany.mockResolvedValue([]);

      const result = await service.list({ organizationId: org, entityType: 'policy', entityId: 'pol_1' });

      expect(result.count).toBe(1);
      expect(result.data[0].owner).toEqual({ id: 'mem_1', name: 'Ada', email: 'ada@x.io', image: null });
      expect(result.data[0].frameworks).toEqual([
        {
          frameworkInstanceId: 'frm_iso',
          frameworkName: 'ISO 27001',
          requirements: [
            { identifier: 'A.5.15', name: 'Req A.5.15' },
            { identifier: 'A.5.18', name: 'Req A.5.18' },
          ],
        },
        { frameworkInstanceId: 'frm_pci', frameworkName: 'PCI DSS', requirements: [{ identifier: '7.2.1', name: 'Req 7.2.1' }] },
      ]);
    });

    it('limits a framework-scoped task link to the frameworks it was made for', async () => {
      mockDb.task.findFirst.mockResolvedValue({ id: 'tsk_1' });
      mockDb.control.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([accessRights]);
      mockDb.frameworkControlTaskLink.findMany.mockResolvedValue([
        { controlId: 'ctl_access', frameworkInstanceId: 'frm_pci' },
      ]);

      const result = await service.list({ organizationId: org, entityType: 'task', entityId: 'tsk_1' });

      expect(result.data[0].frameworks.map((f) => f.frameworkName)).toEqual(['PCI DSS']);
    });

    it('rejects an entity from another org', async () => {
      mockDb.policy.findFirst.mockResolvedValue(null);
      await expect(
        service.list({ organizationId: org, entityType: 'policy', entityId: 'pol_other' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an unknown evidence form type', async () => {
      await expect(
        service.list({ organizationId: org, entityType: 'evidence_form', entityId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('link', () => {
    it('rejects controls outside the org', async () => {
      mockDb.policy.findFirst.mockResolvedValue({ id: 'pol_1' });
      mockDb.control.count.mockResolvedValue(1);
      await expect(
        service.link({ organizationId: org, entityType: 'policy', entityId: 'pol_1', controlIds: ['a', 'b'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(controlsService.linkPolicies).not.toHaveBeenCalled();
    });

    it('links a policy through the fan-out path (no framework instance)', async () => {
      mockDb.policy.findFirst.mockResolvedValue({ id: 'pol_1' });
      mockDb.control.count.mockResolvedValue(1);
      await service.link({ organizationId: org, entityType: 'policy', entityId: 'pol_1', controlIds: ['ctl_access'] });
      expect(controlsService.linkPolicies).toHaveBeenCalledWith('ctl_access', org, ['pol_1']);
    });

    it('links an evidence form type', async () => {
      mockDb.control.count.mockResolvedValue(1);
      await service.link({ organizationId: org, entityType: 'evidence_form', entityId: 'access_request', controlIds: ['ctl_access'] });
      expect(controlsService.linkDocumentTypes).toHaveBeenCalledWith('ctl_access', org, ['access_request']);
    });

    it('accepts the URL form of an evidence form type', async () => {
      mockDb.control.count.mockResolvedValue(1);
      await service.link({ organizationId: org, entityType: 'evidence_form', entityId: 'access-request', controlIds: ['ctl_access'] });
      expect(controlsService.linkDocumentTypes).toHaveBeenCalledWith('ctl_access', org, ['access_request']);
    });

    it('links an ISMS document directly', async () => {
      mockDb.ismsDocument.findFirst.mockResolvedValue({ id: 'doc_1' });
      mockDb.control.count.mockResolvedValue(1);
      await service.link({ organizationId: org, entityType: 'isms_document', entityId: 'doc_1', controlIds: ['ctl_access'] });
      expect(mockDb.ismsDocumentControlLink.createMany).toHaveBeenCalledWith({
        data: [{ ismsDocumentId: 'doc_1', controlId: 'ctl_access' }],
        skipDuplicates: true,
      });
    });
  });

  describe('unlink', () => {
    it('removes a task link for every framework', async () => {
      mockDb.task.findFirst.mockResolvedValue({ id: 'tsk_1' });
      mockDb.control.findFirst.mockResolvedValue({ id: 'ctl_access' });
      await service.unlink({ organizationId: org, entityType: 'task', entityId: 'tsk_1', controlId: 'ctl_access' });
      expect(mockDb.task.update).toHaveBeenCalledWith({
        where: { id: 'tsk_1', organizationId: org },
        data: { controls: { disconnect: { id: 'ctl_access' } } },
      });
      expect(mockDb.frameworkControlTaskLink.deleteMany).toHaveBeenCalledWith({
        where: { controlId: 'ctl_access', taskId: 'tsk_1' },
      });
    });

    it('refuses a control from another org', async () => {
      mockDb.task.findFirst.mockResolvedValue({ id: 'tsk_1' });
      mockDb.control.findFirst.mockResolvedValue(null);
      await expect(
        service.unlink({ organizationId: org, entityType: 'task', entityId: 'tsk_1', controlId: 'ctl_x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
