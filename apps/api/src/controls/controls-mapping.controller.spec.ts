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
import { ControlsOverviewService } from './controls-overview.service';
import { RelatedControlsService } from './related-controls.service';

describe('ControlsMappingController', () => {
  let controller: ControlsMappingController;
  const overview = { list: jest.fn(), setOwner: jest.fn(), crosswalkCsv: jest.fn() };
  const related = { list: jest.fn(), link: jest.fn(), unlink: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ControlsMappingController],
      providers: [
        { provide: ControlsOverviewService, useValue: overview },
        { provide: RelatedControlsService, useValue: related },
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
