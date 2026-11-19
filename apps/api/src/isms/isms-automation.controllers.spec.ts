import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { IsmsAutomationController } from './isms-automation.controller';
import { IsmsNonconformitiesController } from './isms-nonconformities.controller';
import {
  previewComputedMetrics,
  recordComputedMetrics,
} from './documents/metric-automation';

jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('../auth/hybrid-auth.guard', () => ({
  HybridAuthGuard: class MockHybridAuthGuard {},
}));
jest.mock('../auth/permission.guard', () => ({
  PermissionGuard: class MockPermissionGuard {},
  PERMISSIONS_KEY: 'permissions',
}));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('./isms-readiness.service', () => ({
  IsmsReadinessService: class MockReadiness {},
}));
jest.mock('./isms-role-assignment.service', () => ({
  IsmsRoleAssignmentService: class MockAssignments {},
}));
jest.mock('./isms-nonconformity.service', () => ({
  IsmsNonconformityService: class MockNonconformities {},
}));
jest.mock('./documents/metric-automation', () => ({
  previewComputedMetrics: jest.fn(),
  recordComputedMetrics: jest.fn(),
}));

const READ = [{ resource: 'evidence', actions: ['read'] }];
const UPDATE = [{ resource: 'evidence', actions: ['update'] }];
const reflector = new Reflector();

describe('IsmsAutomationController', () => {
  const readiness = { getReadiness: jest.fn() };
  const assignments = { acknowledge: jest.fn() };
  const controller = new IsmsAutomationController(
    readiness as never,
    assignments as never,
  );
  const permissionsFor = (method: keyof IsmsAutomationController) =>
    reflector.get(PERMISSIONS_KEY, IsmsAutomationController.prototype[method]);

  beforeEach(() => jest.clearAllMocks());

  it('lets read-only users see readiness and computed metrics', () => {
    expect(permissionsFor('getReadiness')).toEqual(READ);
    expect(permissionsFor('previewMetrics')).toEqual(READ);
    // Self-only: any reader may acknowledge their OWN role (checked in the service).
    expect(permissionsFor('acknowledgeRole')).toEqual(READ);
  });

  it('requires evidence:update to record computed metrics', () => {
    expect(permissionsFor('recordMetrics')).toEqual(UPDATE);
  });

  it('requires a frameworkId for readiness', async () => {
    await expect(controller.getReadiness(undefined, 'org_1')).rejects.toThrow(
      BadRequestException,
    );
    await controller.getReadiness('frk_1', 'org_1');
    expect(readiness.getReadiness).toHaveBeenCalledWith({
      organizationId: 'org_1',
      frameworkId: 'frk_1',
    });
  });

  it('records computed metrics for the last closed period by default (#39)', async () => {
    await controller.recordMetrics('doc_1', {}, 'org_1', 'mem_1');
    expect(recordComputedMetrics).toHaveBeenCalledWith({
      documentId: 'doc_1',
      organizationId: 'org_1',
      memberId: 'mem_1',
      period: 'previous',
    });
    await controller.previewMetrics('doc_1', 'org_1');
    expect(previewComputedMetrics).toHaveBeenCalledWith({
      documentId: 'doc_1',
      organizationId: 'org_1',
    });
  });

  it('acknowledges as the signed-in member', async () => {
    await controller.acknowledgeRole('isms_ra_1', 'org_1', 'mem_1');
    expect(assignments.acknowledge).toHaveBeenCalledWith({
      assignmentId: 'isms_ra_1',
      organizationId: 'org_1',
      memberId: 'mem_1',
    });
  });
});

describe('IsmsNonconformitiesController', () => {
  const service = { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() };
  const controller = new IsmsNonconformitiesController(service as never);
  const permissionsFor = (method: keyof IsmsNonconformitiesController) =>
    reflector.get(PERMISSIONS_KEY, IsmsNonconformitiesController.prototype[method]);

  it('gates reads with evidence:read and writes with evidence:update', () => {
    expect(permissionsFor('list')).toEqual(READ);
    expect(permissionsFor('create')).toEqual(UPDATE);
    expect(permissionsFor('update')).toEqual(UPDATE);
    expect(permissionsFor('remove')).toEqual(UPDATE);
  });

  it('scopes every call to the organization', async () => {
    await controller.list('org_1');
    expect(service.list).toHaveBeenCalledWith({ organizationId: 'org_1' });
    const dto = { source: 'incident' as const, description: 'Laptop lost' };
    await controller.create(dto, 'org_1');
    expect(service.create).toHaveBeenCalledWith({ organizationId: 'org_1', dto });
    await controller.update('nc_1', { status: 'closed' }, 'org_1');
    expect(service.update).toHaveBeenCalledWith({
      id: 'nc_1',
      organizationId: 'org_1',
      dto: { status: 'closed' },
    });
    await controller.remove('nc_1', 'org_1');
    expect(service.remove).toHaveBeenCalledWith({ id: 'nc_1', organizationId: 'org_1' });
  });
});
