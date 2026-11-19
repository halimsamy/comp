jest.mock('@db', () => ({ db: {}, Prisma: {}, EvidenceFormType: {} }));
jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({
  statement: { control: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

import { Test } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { ControlsMappingController } from './controls-mapping.controller';
import { ControlsBulkOwnerService } from './controls-bulk-owner.service';
import { ControlsOverviewService } from './controls-overview.service';
import { RelatedControlsService } from './related-controls.service';

describe('ControlsMappingController', () => {
  let controller: ControlsMappingController;
  const overview = { list: jest.fn(), setOwner: jest.fn(), crosswalkCsv: jest.fn() };
  const related = { list: jest.fn(), link: jest.fn(), unlink: jest.fn() };
  const bulk = { setOwner: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ControlsMappingController],
      providers: [
        { provide: ControlsOverviewService, useValue: overview },
        { provide: RelatedControlsService, useValue: related },
        { provide: ControlsBulkOwnerService, useValue: bulk },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ControlsMappingController);
  });

  it('requires control:read to view and control:update to change links or owners', () => {
    const perm = (method: keyof ControlsMappingController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, ControlsMappingController.prototype[method]);
    expect(perm('overview')).toEqual([{ resource: 'control', actions: ['read'] }]);
    expect(perm('crosswalk')).toEqual([{ resource: 'control', actions: ['read'] }]);
    expect(perm('related')).toEqual([{ resource: 'control', actions: ['read'] }]);
    expect(perm('link')).toEqual([{ resource: 'control', actions: ['update'] }]);
    expect(perm('unlink')).toEqual([{ resource: 'control', actions: ['update'] }]);
    expect(perm('setOwner')).toEqual([{ resource: 'control', actions: ['update'] }]);
    expect(perm('bulkOwner')).toEqual([{ resource: 'control', actions: ['update'] }]);
    expect(perm('evidence')).toEqual([{ resource: 'control', actions: ['read'] }]);
    expect(perm('ownerSuggestions')).toEqual([{ resource: 'control', actions: ['read'] }]);
  });

  it('passes bulk owner changes to the service with the caller organization', async () => {
    const dto = { controlIds: ['ctl_1', 'ctl_2'], ownerId: 'mem_1', assignLinkedWork: true };
    await controller.bulkOwner('org_1', dto);
    expect(bulk.setOwner).toHaveBeenCalledWith({ organizationId: 'org_1', dto });
  });

  it('caps the evidence lookup at 200 controls', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `ctl_${i}`).join(',');
    await expect(controller.evidence('org_1', ids)).rejects.toThrow('at most 200');
    await expect(controller.evidence('org_1', '')).resolves.toEqual({ data: [], count: 0 });
  });

  it('scopes every call to the caller organization', async () => {
    await controller.overview('org_1');
    expect(overview.list).toHaveBeenCalledWith('org_1');

    await controller.related('org_1', { entityType: 'policy', entityId: 'pol_1' });
    expect(related.list).toHaveBeenCalledWith({ organizationId: 'org_1', entityType: 'policy', entityId: 'pol_1' });

    await controller.link('org_1', { entityType: 'task', entityId: 'tsk_1', controlIds: ['ctl_1'] });
    expect(related.link).toHaveBeenCalledWith({
      organizationId: 'org_1',
      entityType: 'task',
      entityId: 'tsk_1',
      controlIds: ['ctl_1'],
    });

    await controller.unlink('org_1', 'ctl_1', { entityType: 'isms_document', entityId: 'doc_1' });
    expect(related.unlink).toHaveBeenCalledWith({
      organizationId: 'org_1',
      controlId: 'ctl_1',
      entityType: 'isms_document',
      entityId: 'doc_1',
    });

    await controller.setOwner('org_1', 'ctl_1', {});
    expect(overview.setOwner).toHaveBeenCalledWith({ organizationId: 'org_1', controlId: 'ctl_1', ownerId: null });
  });

  it('sends the org crosswalk as a CSV attachment', async () => {
    overview.crosswalkCsv.mockResolvedValue('Control,ISO 27001 requirements');
    const res = { setHeader: jest.fn(), send: jest.fn() };

    await controller.crosswalk('org_1', res as never);

    expect(overview.crosswalkCsv).toHaveBeenCalledWith('org_1');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/attachment; filename="control-crosswalk-\d{4}-\d{2}-\d{2}\.csv"/),
    );
    expect(res.send).toHaveBeenCalledWith('Control,ISO 27001 requirements');
  });
});
