import { Body, Controller, Delete, Get, Param, Put, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { AuditWorkspaceService } from './audit-workspace.service';
import { CreateAuditCommentDto, ReviewRequirementDto } from './dto/audit-workspace.dto';

/** The auditor workspace: requirements with evidence, assessments and comments. */
@ApiTags('Audits')
@Controller({ path: 'audits/:auditId', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
@ApiParam({ name: 'auditId', example: 'aud_abc123' })
export class AuditWorkspaceController {
  constructor(private readonly workspace: AuditWorkspaceService) {}

  @Get('requirements')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'List audit requirements with evidence',
    description:
      "Returns each requirement of the audited framework with its tasks, policies and documents, readiness for the audit period, and the auditor's assessment.",
  })
  async listRequirements(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
  ) {
    const data = await this.workspace.listRequirements({ auth, auditId });
    return { data, count: data.length };
  }

  @Put('requirements/:requirementId/review')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'Assess an audit requirement',
    description:
      "Records the assigned auditor's assessment of a requirement's evidence: accepted, flagged or requested, with an optional note. Only the audit's auditors can do this.",
  })
  @ApiParam({ name: 'requirementId', example: 'frk_rq_abc123' })
  @ApiBody({ type: ReviewRequirementDto })
  async review(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Param('requirementId') requirementId: string,
    @Body() body: ReviewRequirementDto,
  ) {
    return this.workspace.review({ auth, auditId, requirementId, dto: body });
  }

  @Delete('requirements/:requirementId/review')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'Clear an audit requirement assessment',
    description:
      "Removes the assigned auditor's assessment of a requirement so it shows as not reviewed again. Only the audit's auditors can do this.",
  })
  @ApiParam({ name: 'requirementId', example: 'frk_rq_abc123' })
  async clearReview(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Param('requirementId') requirementId: string,
  ) {
    return this.workspace.clearReview({ auth, auditId, requirementId });
  }

  @Get('comments')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'List audit comments',
    description:
      'Returns the questions and answers between the team and the auditors on an audit, optionally for one requirement, oldest first.',
  })
  @ApiQuery({ name: 'requirementId', required: false })
  async listComments(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Query('requirementId') requirementId?: string,
  ) {
    const data = await this.workspace.listComments({ auth, auditId, requirementId });
    return { data, count: data.length };
  }

  @Post('comments')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'Comment on an audit',
    description:
      'Adds a comment to an audit or to one of its requirements, so auditors and the team can discuss evidence without raising a finding.',
  })
  @ApiBody({ type: CreateAuditCommentDto })
  async addComment(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Body() body: CreateAuditCommentDto,
  ) {
    return this.workspace.addComment({ auth, auditId, dto: body });
  }
}
