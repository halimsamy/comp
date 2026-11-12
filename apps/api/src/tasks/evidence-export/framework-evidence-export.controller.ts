import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { tasks } from '@trycompai/jobs';
import { AuditRead } from '../../audit/skip-audit-log.decorator';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermissions } from '../../auth/require-permission.decorator';
import { FrameworkEvidenceExportService } from './framework-evidence-export.service';

@ApiTags('Evidence Export')
@Controller({ path: 'evidence-export', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class FrameworkEvidenceExportController {
  constructor(
    private readonly frameworkEvidenceExportService: FrameworkEvidenceExportService,
  ) {}

  @Post('frameworks/:frameworkInstanceId')
  // The ZIP bundles policies and evidence for every requirement of the framework.
  @RequirePermissions([
    { resource: 'framework', actions: ['read'] },
    { resource: 'evidence', actions: ['read'] },
    { resource: 'policy', actions: ['read'] },
  ])
  @AuditRead()
  @ApiOperation({
    summary: 'Export framework evidence as ZIP',
    description:
      'Starts a background job that builds a ZIP with one folder per framework requirement containing its policies (PDF), task evidence and document submissions. Returns a run ID; the finished run (GET /v1/job-runs/:runId) carries a download URL.',
  })
  @ApiParam({
    name: 'frameworkInstanceId',
    description: 'Framework instance identifier',
    example: 'frm_abc123def456',
  })
  @ApiResponse({ status: 201, description: 'Export job started' })
  @ApiResponse({ status: 404, description: 'Framework not found' })
  async exportFrameworkEvidence(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
  ) {
    // 404 for a framework outside the caller's organization before queueing anything.
    await this.frameworkEvidenceExportService.loadFramework(
      organizationId,
      frameworkInstanceId,
    );

    const handle = await tasks.trigger(
      'export-framework-evidence',
      { organizationId, frameworkInstanceId },
      {
        concurrencyKey: organizationId,
        // Collapse double-clicks into one run; short so a failed run can be retried soon.
        idempotencyKey: `framework-evidence-export:${frameworkInstanceId}`,
        idempotencyKeyTTL: '2m',
      },
    );

    return { runId: handle.id };
  }
}
