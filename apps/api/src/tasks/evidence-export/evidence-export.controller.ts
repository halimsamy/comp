import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { tasks } from '@trycompai/jobs';
import type { Request, Response } from 'express';
import { AuditRead } from '../../audit/skip-audit-log.decorator';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { EvidenceExportService } from './evidence-export.service';
import { TasksService } from '../tasks.service';
import { pipeArchiveToResponse } from './pipe-archive-to-response';

@ApiTags('Evidence Export')
@Controller({ path: 'tasks', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class EvidenceExportController {
  private readonly logger = new Logger(EvidenceExportController.name);

  constructor(
    private readonly evidenceExportService: EvidenceExportService,
    private readonly tasksService: TasksService,
  ) {}

  /**
   * Get evidence summary for a task
   */
  @Get(':taskId/evidence')
  @RequirePermission('evidence', 'read')
  @ApiOperation({
    summary: 'Get task evidence summary',
    description:
      'Retrieve a summary of all automation evidence for a specific task',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
    example: 'tsk_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Evidence summary retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async getTaskEvidenceSummary(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
  ) {
    this.logger.log('Get task evidence summary', { organizationId, taskId });
    await this.tasksService.verifyTaskAccess(organizationId, taskId);
    return this.evidenceExportService.getTaskEvidenceSummary(
      organizationId,
      taskId,
    );
  }

  /**
   * Export a single automation's evidence as PDF
   */
  @Get(':taskId/evidence/automation/:automationId/pdf')
  @RequirePermission('evidence', 'read')
  @AuditRead()
  @ApiOperation({
    summary: 'Export automation evidence as PDF',
    description:
      'Generate and download a PDF containing all evidence for a specific automation',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
  })
  @ApiParam({
    name: 'automationId',
    description: 'Unique automation identifier (checkId for app automations)',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF file generated successfully',
    content: {
      'application/pdf': {},
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Task or automation not found',
  })
  async exportAutomationPDF(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Param('automationId') automationId: string,
    @Res() res: Response,
  ) {
    this.logger.log('Export automation evidence PDF', {
      organizationId,
      taskId,
      automationId,
    });
    await this.tasksService.verifyTaskAccess(organizationId, taskId);

    const result = await this.evidenceExportService.exportAutomationPDF(
      organizationId,
      taskId,
      automationId,
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.fileBuffer);
  }

  /**
   * Export all evidence for a task as ZIP
   */
  @Get(':taskId/evidence/export')
  @RequirePermission('evidence', 'read')
  @AuditRead()
  @ApiOperation({
    summary: 'Export task evidence as ZIP',
    description:
      'Generate and download a ZIP file containing all automation evidence for a task',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Unique task identifier',
  })
  @ApiQuery({
    name: 'includeJson',
    description: 'Include raw JSON files alongside PDFs',
    type: 'boolean',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'ZIP file generated successfully',
    content: {
      'application/zip': {},
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  async exportTaskEvidenceZip(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Query('includeJson') includeJson: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.logger.log('Export task evidence ZIP', {
      organizationId,
      taskId,
      includeJson: includeJson === 'true',
    });
    await this.tasksService.verifyTaskAccess(organizationId, taskId);

    const { archive, filename } =
      await this.evidenceExportService.streamTaskEvidenceZip(
        organizationId,
        taskId,
        { includeRawJson: includeJson === 'true' },
      );

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    // Push the response status line + headers to the wire immediately so
    // upstream proxies (Cloudflare, ALB, etc.) don't apply their idle-timeout
    // while we assemble the first archive entry — a TTFB > ~60s on a large
    // org otherwise surfaces in the browser as `TypeError: Failed to fetch`.
    res.flushHeaders();

    pipeArchiveToResponse({
      archive,
      req,
      res,
      logger: this.logger,
      tag: `task ${taskId}`,
    });
  }
}

/**
 * Auditor-only controller for bulk evidence export.
 * The heavy work runs in a background job to avoid OOM in the API.
 */
@ApiTags('Evidence Export (Auditor)')
@Controller({ path: 'evidence-export', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AuditorEvidenceExportController {
  private readonly logger = new Logger(AuditorEvidenceExportController.name);

  @Post('all')
  @RequirePermission('evidence', 'read')
  @AuditRead()
  @ApiOperation({
    summary: 'Trigger bulk evidence export (Auditor only)',
    description:
      'Starts a background job that generates a ZIP of all evidence. Returns a run ID for progress tracking.',
  })
  @ApiQuery({
    name: 'includeJson',
    description: 'Include raw JSON files alongside PDFs',
    type: 'boolean',
    required: false,
  })
  @ApiResponse({
    status: 201,
    description: 'Export job started',
  })
  async exportAllEvidence(
    @OrganizationId() organizationId: string,
    @Query('includeJson') includeJson: string,
  ) {
    const includeJsonBool = includeJson === 'true';
    this.logger.log('Auditor triggering bulk evidence export', {
      organizationId,
      includeJson: includeJsonBool,
    });

    const handle = await tasks.trigger(
      'export-organization-evidence',
      { organizationId, includeJson: includeJsonBool },
      {
        // With the task queue's concurrencyLimit of 1, this key serializes exports
        // per org (a burst of clicks never runs two heavy exports for one org)
        // while other orgs' exports run in parallel.
        concurrencyKey: organizationId,
        // Collapse rapid duplicate triggers (double-click / retry) for the same
        // org + options into a single run for the TTL window.
        idempotencyKey: `evidence-export:${organizationId}:${includeJsonBool}`,
        idempotencyKeyTTL: '30m',
      },
    );

    return { runId: handle.id };
  }
}
