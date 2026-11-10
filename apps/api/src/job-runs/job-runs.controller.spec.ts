import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PERMISSIONS_KEY, PermissionGuard } from '../auth/permission.guard';
import type { AuthenticatedRequest } from '../auth/types';
import { JOB_RUN_READ_RESOURCES } from './job-run-access';
import { JobRunsController } from './job-runs.controller';
import { JobRunsService } from './job-runs.service';

type Row = { id: string; organizationId: string | null; taskId: string; status: string };
const rows: Row[] = [
  { id: 'jrun_owned', organizationId: 'org_a', taskId: 'export-organization-evidence', status: 'COMPLETED' },
  { id: 'jrun_policy', organizationId: 'org_a', taskId: 'update-policy', status: 'EXECUTING' },
  { id: 'jrun_unlisted', organizationId: 'org_a', taskId: 'send-email', status: 'COMPLETED' },
  { id: 'jrun_other', organizationId: 'org_b', taskId: 'export-organization-evidence', status: 'EXECUTING' },
  { id: 'jrun_system', organizationId: null, taskId: 'export-organization-evidence', status: 'COMPLETED' },
];

const mockFindFirst = jest.fn(
  async (args: { where: { id: string; organizationId: string } }) => {
    const row = rows.find(
      (r) => r.id === args.where.id && r.organizationId === args.where.organizationId,
    );
    return row ? { id: row.id, taskId: row.taskId, status: row.status } : null;
  },
);
const mockRoleFindMany = jest.fn(async () => [{ permissions: { policy: ['read'] } }]);

jest.mock('@db', () => ({
  db: {
    jobRun: {
      findFirst: (args: { where: { id: string; organizationId: string } }) =>
        mockFindFirst(args),
    },
    organizationRole: { findMany: () => mockRoleFindMany() },
  },
}));

jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {
    auditor: { app: ['read'], evidence: ['read'] },
    admin: { app: ['read'], evidence: ['read'], policy: ['read'] },
  },
}));

const caller = (overrides: Partial<AuthenticatedRequest> = {}) =>
  ({
    organizationId: 'org_a',
    authType: 'session',
    isApiKey: false,
    isPlatformAdmin: false,
    userRoles: ['admin'],
    ...overrides,
  }) as AuthenticatedRequest;

describe('JobRunsController', () => {
  let controller: JobRunsController;
  const mockGuard = { canActivate: jest.fn().mockReturnValue(true) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobRunsController],
      providers: [JobRunsService],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionGuard)
      .useValue(mockGuard)
      .compile();
    controller = module.get(JobRunsController);
    mockFindFirst.mockClear();
  });

  it('requires app:read', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, JobRunsController.prototype.findOne)).toEqual([
      { resource: 'app', actions: ['read'] },
    ]);
  });

  it('returns a run that belongs to the caller organization', async () => {
    await expect(controller.findOne(caller(), 'jrun_owned')).resolves.toEqual({
      id: 'jrun_owned',
      taskId: 'export-organization-evidence',
      status: 'COMPLETED',
    });
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'jrun_owned', organizationId: 'org_a' },
        select: expect.not.objectContaining({ organizationId: true }),
      }),
    );
  });

  it.each(['jrun_other', 'jrun_system', 'jrun_missing'])('returns 404 for %s', async (runId) => {
    await expect(controller.findOne(caller(), runId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 for tasks not listed in the read-resource map', async () => {
    await expect(controller.findOne(caller(), 'jrun_unlisted')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 404 when the role lacks read on the task resources (read-only auditor)', async () => {
    const auditor = caller({ userRoles: ['auditor'] });
    await expect(controller.findOne(auditor, 'jrun_owned')).resolves.toBeDefined();
    await expect(controller.findOne(auditor, 'jrun_policy')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resolves custom roles', async () => {
    const custom = caller({ userRoles: ['policy-reader'] });
    await expect(controller.findOne(custom, 'jrun_policy')).resolves.toBeDefined();
    await expect(controller.findOne(custom, 'jrun_owned')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('checks API key scopes', async () => {
    const apiKey = caller({ isApiKey: true, authType: 'api-key', userRoles: null });
    await expect(
      controller.findOne({ ...apiKey, apiKeyScopes: ['app:read', 'evidence:read'] } as AuthenticatedRequest, 'jrun_owned'),
    ).resolves.toBeDefined();
    await expect(
      controller.findOne({ ...apiKey, apiKeyScopes: ['app:read'] } as AuthenticatedRequest, 'jrun_owned'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['internal-parse-questionnaire', 'delete-knowledge-base-document-from-vector'])(
    'lists the UI-polled questionnaire task %s',
    (taskId) => {
      expect(JOB_RUN_READ_RESOURCES.get(taskId)).toEqual(['questionnaire']);
    },
  );

  it('denies a caller without roles', async () => {
    await expect(controller.findOne(caller({ userRoles: null }), 'jrun_owned')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
