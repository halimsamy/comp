import {
  BadRequestException,
  Body,
  ForbiddenException,
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
import { getVisibleAudit } from '../../audits/audit-access';
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
      'Starts a job building a ZIP with one folder per requirement: applicability, approved policies, tasks, documents, ISMS documents, SoA and registers, plus vendor documents and risk review PDFs. Optional audit period and audit engagement (adds the audit trail and evidence requests). Poll GET /v1/job-runs/:runId for the download URL; session users are also emailed the link.',
  })
  @ApiParam({
    name: 'frameworkInstanceId',
    description: 'Framework instance identifier',
    example: 'frm_abc123def456',
  })
  @ApiBody({ type: ExportFrameworkEvidenceDto, required: false })
  @ApiResponse({ status: 201, description: 'Export job started' })
  @ApiResponse({ status: 400, description: 'Invalid audit period, or the audit is for another framework' })
  @ApiResponse({ status: 403, description: 'Audit export without audit read access' })
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
    const auditId = body?.auditId;
    if (auditId) {
      // The SoA flag is audit read; the audit trail and requests need it too.
      if (!access.soa) throw new ForbiddenException('Exporting an audit requires audit read access');
      const audit = await getVisibleAudit({ auth: authContext, auditId });
      if (audit.frameworkInstanceId !== frameworkInstanceId) {
        throw new BadRequestException('This audit is for another framework');
      }
    }
    const handle = await tasks.trigger(
      'export-framework-evidence',
      {
        organizationId,
        frameworkInstanceId,
        access,
        period,
        auditId,
        // Session callers get the download link by email; API keys poll the run.
        notifyEmail: authContext.userEmail,
      },
      {
        concurrencyKey: organizationId,
        // Collapse double-clicks into one run; short so a failed run can be retried soon.
        // Keyed by access too, so a caller never gets a run built with someone else's permissions.
        idempotencyKey: `framework-evidence-export:${frameworkInstanceId}:${body?.from ?? ''}:${body?.to ?? ''}:${auditId ?? ''}:${authContext.userId ?? ''}:${access.registers.join(',')}:${access.soa}`,
        idempotencyKeyTTL: '2m',
      },
    );

    return { runId: handle.id };
  }
}
