import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { tasks } from '@trycompai/jobs';
import { AuditRead } from '../../audit/skip-audit-log.decorator';
import { AuthContext, OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermissions } from '../../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../../auth/types';
import { ExportFrameworkEvidenceDto, toPeriodBounds } from './framework-evidence-export.dto';
import { FrameworkEvidenceExportService } from './framework-evidence-export.service';
import { resolveNativeAccess } from './native-access';

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
      'Starts a job building a ZIP with one folder per requirement: policies, tasks, documents, ISMS documents, SoA and registers. Optional audit period. Poll GET /v1/job-runs/:runId for the download URL.',
  })
  @ApiParam({
    name: 'frameworkInstanceId',
    description: 'Framework instance identifier',
    example: 'frm_abc123def456',
  })
  @ApiBody({ type: ExportFrameworkEvidenceDto, required: false })
  @ApiResponse({ status: 201, description: 'Export job started' })
  @ApiResponse({ status: 400, description: 'Invalid audit period' })
  @ApiResponse({ status: 404, description: 'Framework not found' })
  async exportFrameworkEvidence(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() body: ExportFrameworkEvidenceDto = {},
  ) {
    const period = toPeriodBounds(body ?? {});
    const from = period.from ? new Date(period.from) : null;
    const to = period.to ? new Date(period.to) : null;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
      throw new BadRequestException('The audit period has an invalid date');
    }
    if (from && to && from > to) {
      throw new BadRequestException('The audit period must start before it ends');
    }

    // 404 for a framework outside the caller's organization before queueing anything.
    await this.frameworkEvidenceExportService.loadFramework(
      organizationId,
      frameworkInstanceId,
    );

    // Registers and the SoA need their own read permissions; without them
    // the export still runs and the README says what was left out.
    const access = await resolveNativeAccess(authContext);
    const handle = await tasks.trigger(
      'export-framework-evidence',
      { organizationId, frameworkInstanceId, access, period },
      {
        concurrencyKey: organizationId,
        // Collapse double-clicks into one run; short so a failed run can be retried soon.
        // Keyed by access too, so a caller never gets a run built with someone else's permissions.
        idempotencyKey: `framework-evidence-export:${frameworkInstanceId}:${body?.from ?? ''}:${body?.to ?? ''}:${access.registers.join(',')}:${access.soa}`,
        idempotencyKeyTTL: '2m',
      },
    );

    return { runId: handle.id };
  }
}
