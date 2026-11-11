import {
  Controller,
  Get,
  Logger,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuditRead } from '../../audit/skip-audit-log.decorator';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermissions } from '../../auth/require-permission.decorator';
import { FrameworkEvidenceExportService } from './framework-evidence-export.service';
import { pipeArchiveToResponse } from './pipe-archive-to-response';

@ApiTags('Evidence Export')
@Controller({ path: 'evidence-export', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class FrameworkEvidenceExportController {
  private readonly logger = new Logger(FrameworkEvidenceExportController.name);

  constructor(
    private readonly frameworkEvidenceExportService: FrameworkEvidenceExportService,
  ) {}

  @Get('frameworks/:frameworkInstanceId')
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
      'Download a ZIP with one folder per framework requirement containing its policies (PDF), task evidence and document submissions.',
  })
  @ApiParam({
    name: 'frameworkInstanceId',
    description: 'Framework instance identifier',
    example: 'frm_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'ZIP file streamed',
    content: { 'application/zip': {} },
  })
  @ApiResponse({ status: 404, description: 'Framework not found' })
  async exportFrameworkEvidence(
    @OrganizationId() organizationId: string,
    @Param('frameworkInstanceId') frameworkInstanceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { archive, filename } =
      await this.frameworkEvidenceExportService.streamFrameworkEvidenceZip(
        organizationId,
        frameworkInstanceId,
      );

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Send headers now so proxies don't idle-timeout while the first entries build.
    res.flushHeaders();

    pipeArchiveToResponse({
      archive,
      req,
      res,
      logger: this.logger,
      tag: `framework ${frameworkInstanceId}`,
    });
  }
}
