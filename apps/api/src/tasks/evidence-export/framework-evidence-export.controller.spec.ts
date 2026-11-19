const mockTrigger = jest.fn();
jest.mock('@trycompai/jobs', () => ({ tasks: { trigger: mockTrigger } }));
jest.mock('@db', () => ({ db: {} }));
jest.mock('../../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
const mockResolveNativeAccess = jest.fn();
jest.mock('./native-access', () => ({
  resolveNativeAccess: (...args: unknown[]) => mockResolveNativeAccess(...args),
}));
const mockGetVisibleAudit = jest.fn();
jest.mock('../../audits/audit-access', () => ({
  getVisibleAudit: (...args: unknown[]) => mockGetVisibleAudit(...args),
}));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { FrameworkEvidenceExportController } from './framework-evidence-export.controller';
import { FrameworkEvidenceExportService } from './framework-evidence-export.service';
import type { AuthContext } from '../../auth/types';

const ctx = {
  organizationId: 'org_1',
  userRoles: ['auditor'],
  userId: 'usr_1',
  userEmail: 'ada@spare.test',
} as AuthContext;
const access = { registers: ['risks', 'findings'], soa: true };

describe('FrameworkEvidenceExportController', () => {
  let controller: FrameworkEvidenceExportController;
  const service = { loadFramework: jest.fn() };

  beforeEach(async () => {
    mockTrigger.mockReset().mockResolvedValue({ id: 'jrun_1' });
    service.loadFramework.mockReset().mockResolvedValue({ id: 'frm_1' });
    mockResolveNativeAccess.mockReset().mockResolvedValue(access);

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
    const result = await controller.exportFrameworkEvidence('org_1', 'frm_1', ctx, {});

    expect(service.loadFramework).toHaveBeenCalledWith('org_1', 'frm_1');
    expect(mockResolveNativeAccess).toHaveBeenCalledWith(ctx);
    expect(mockTrigger).toHaveBeenCalledWith(
      'export-framework-evidence',
      {
        organizationId: 'org_1',
        frameworkInstanceId: 'frm_1',
        access,
        period: {},
        auditId: undefined,
        notifyEmail: 'ada@spare.test',
      },
      {
        concurrencyKey: 'org_1',
        idempotencyKey: 'framework-evidence-export:frm_1::::usr_1:risks,findings:true',
        idempotencyKeyTTL: '2m',
      },
    );
    expect(result).toEqual({ runId: 'jrun_1' });
  });

  it('passes the audit period as inclusive day bounds', async () => {
    await controller.exportFrameworkEvidence('org_1', 'frm_1', ctx, {
      from: '2026-01-01',
      to: '2026-06-30',
    });

    expect(mockTrigger).toHaveBeenCalledWith(
      'export-framework-evidence',
      expect.objectContaining({
        period: { from: '2026-01-01T00:00:00.000Z', to: '2026-06-30T23:59:59.999Z' },
      }),
      expect.objectContaining({ idempotencyKey: 'framework-evidence-export:frm_1:2026-01-01:2026-06-30::usr_1:risks,findings:true' }),
    );
  });

  it('rejects a period that ends before it starts or an impossible date', async () => {
    await expect(
      controller.exportFrameworkEvidence('org_1', 'frm_1', ctx, { from: '2026-06-01', to: '2026-01-01' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.exportFrameworkEvidence('org_1', 'frm_1', ctx, { from: '2026-13-45' }),
    ).rejects.toThrow(BadRequestException);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("does not queue a job for another organization's framework", async () => {
    service.loadFramework.mockRejectedValue(new NotFoundException('Framework not found'));

    await expect(controller.exportFrameworkEvidence('org_2', 'frm_1', ctx, {})).rejects.toThrow(
      NotFoundException,
    );
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('exports an audit of this framework when the caller can read audits', async () => {
    mockGetVisibleAudit.mockResolvedValue({ id: 'aud_1', frameworkInstanceId: 'frm_1' });

    await controller.exportFrameworkEvidence('org_1', 'frm_1', ctx, { auditId: 'aud_1' });

    expect(mockGetVisibleAudit).toHaveBeenCalledWith({ auth: ctx, auditId: 'aud_1' });
    expect(mockTrigger).toHaveBeenCalledWith(
      'export-framework-evidence',
      expect.objectContaining({ auditId: 'aud_1' }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining(':aud_1:') }),
    );
  });

  it('rejects an audit of another framework, and audits without audit read', async () => {
    mockGetVisibleAudit.mockResolvedValue({ id: 'aud_1', frameworkInstanceId: 'frm_2' });
    await expect(
      controller.exportFrameworkEvidence('org_1', 'frm_1', ctx, { auditId: 'aud_1' }),
    ).rejects.toThrow(BadRequestException);

    mockResolveNativeAccess.mockResolvedValue({ registers: [], soa: false });
    await expect(
      controller.exportFrameworkEvidence('org_1', 'frm_1', ctx, { auditId: 'aud_1' }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});
