import { ControlsService } from './controls.service';

jest.mock('./sync-framework-links', () => ({
  syncDirectLinksToAllFrameworks: jest.fn().mockResolvedValue(undefined),
}));

const mockDb = {
  frameworkInstance: { findMany: jest.fn() },
  frameworkEditorRequirement: { findMany: jest.fn() },
  requirementMap: { createMany: jest.fn() },
  control: { findUnique: jest.fn() },
  evidenceFormSetting: { findMany: jest.fn() },
  evidenceSubmission: { groupBy: jest.fn() },
};

jest.mock('@db', () => ({
  db: new Proxy({}, { get: (_t, prop: string) => mockDb[prop as keyof typeof mockDb] }),
  EvidenceFormType: {},
  Prisma: {},
}));

/** Evidence once, map many: link fan-out and the union of both link kinds. */
describe('ControlsService cross-framework links', () => {
  const service = new ControlsService();

  beforeEach(() => jest.clearAllMocks());

  describe('linkRequirements', () => {
    it('fans existing evidence out to the newly mapped framework', async () => {
      const { syncDirectLinksToAllFrameworks } = jest.requireMock('./sync-framework-links');
      mockDb.control.findUnique.mockResolvedValue({ id: 'ctrl_1' });
      mockDb.frameworkInstance.findMany.mockResolvedValue([
        { id: 'fi_pci', frameworkId: 'frk_pci', customFrameworkId: null },
      ]);
      mockDb.frameworkEditorRequirement.findMany.mockResolvedValue([
        { id: 'req_721', frameworkId: 'frk_pci' },
      ]);
      mockDb.requirementMap.createMany.mockResolvedValue({ count: 1 });

      await service.linkRequirements('ctrl_1', 'org_1', [
        { requirementId: 'req_721', frameworkInstanceId: 'fi_pci' },
      ]);

      expect(syncDirectLinksToAllFrameworks).toHaveBeenCalledWith({
        controlId: 'ctrl_1',
        organizationId: 'org_1',
      });
    });
  });

  describe('findOne without a framework', () => {
    it('unions control-level and framework-scoped links', async () => {
      mockDb.evidenceFormSetting.findMany.mockResolvedValue([]);
      mockDb.evidenceSubmission.groupBy.mockResolvedValue([]);
      mockDb.control.findUnique.mockResolvedValue({
        id: 'ctrl_1',
        policies: [{ id: 'pol_1', status: 'published' }],
        tasks: [],
        controlDocumentTypes: [{ controlId: 'ctrl_1', formType: 'access_request' }],
        frameworkPolicyLinks: [
          { policy: { id: 'pol_1', status: 'published' } },
          { policy: { id: 'pol_2', status: 'draft' } },
        ],
        frameworkTaskLinks: [{ task: { id: 'tsk_1', status: 'done' } }],
        frameworkDocumentLinks: [
          { controlId: 'ctrl_1', formType: 'access_request' },
          { controlId: 'ctrl_1', formType: 'rbac_matrix' },
        ],
        requirementsMapped: [],
      });

      const result = await service.findOne('ctrl_1', 'org_1');

      expect(result.policies.map((p) => p.id)).toEqual(['pol_1', 'pol_2']);
      expect(result.tasks.map((t) => t.id)).toEqual(['tsk_1']);
      expect(result.controlDocumentTypes.map((d) => d.formType)).toEqual([
        'access_request',
        'rbac_matrix',
      ]);
      expect(result.progress).toMatchObject({ total: 3, completed: 2 });
      expect(result).not.toHaveProperty('frameworkPolicyLinks');
    });
  });
});
