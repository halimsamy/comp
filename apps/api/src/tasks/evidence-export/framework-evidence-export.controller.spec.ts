const mockTrigger = jest.fn();
jest.mock('@trycompai/jobs', () => ({ tasks: { trigger: mockTrigger } }));
jest.mock('@db', () => ({ db: {} }));
jest.mock('../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { FrameworkEvidenceExportController } from './framework-evidence-export.controller';
import { FrameworkEvidenceExportService } from './framework-evidence-export.service';

describe('FrameworkEvidenceExportController', () => {
  let controller: FrameworkEvidenceExportController;
  const service = { loadFramework: jest.fn() };

  beforeEach(async () => {
    mockTrigger.mockReset().mockResolvedValue({ id: 'jrun_1' });
    service.loadFramework.mockReset().mockResolvedValue({ id: 'frm_1' });

    const moduleRef = await Test.createTestingModule({
      controllers: [FrameworkEvidenceExportController],
      providers: [{ provide: FrameworkEvidenceExportService, useValue: service }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(FrameworkEvidenceExportController);
  });

  it('queues the export job for the framework and returns its run id', async () => {
    const result = await controller.exportFrameworkEvidence('org_1', 'frm_1');

    expect(service.loadFramework).toHaveBeenCalledWith('org_1', 'frm_1');
    expect(mockTrigger).toHaveBeenCalledWith(
      'export-framework-evidence',
      { organizationId: 'org_1', frameworkInstanceId: 'frm_1' },
      {
        concurrencyKey: 'org_1',
        idempotencyKey: 'framework-evidence-export:frm_1',
        idempotencyKeyTTL: '2m',
      },
    );
    expect(result).toEqual({ runId: 'jrun_1' });
  });

  it("does not queue a job for another organization's framework", async () => {
    service.loadFramework.mockRejectedValue(new NotFoundException('Framework not found'));

    await expect(controller.exportFrameworkEvidence('org_2', 'frm_1')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});
