import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { UploadAttachmentDto } from '../attachments/upload-attachment.dto';
import { AuditRequestsService } from './audit-requests.service';
import { AuditTeamRequestsService } from './audit-team-requests.service';
import {
  CreateAuditRequestDto,
  CreateTeamAuditRequestsDto,
  DecideAuditRequestDto,
  RespondAuditRequestDto,
} from './dto/audit-workspace.dto';

/** Evidence requests from auditors and the team's responses. */
@ApiTags('Audits')
@Controller({ path: 'audits/:auditId/requests', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
@ApiParam({ name: 'auditId', example: 'aud_abc123' })
export class AuditRequestsController {
  constructor(
    private readonly requests: AuditRequestsService,
    private readonly teamRequests: AuditTeamRequestsService,
  ) {}

  @Get()
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'List audit evidence requests',
    description:
      "Returns the auditors' evidence requests for an audit with status, due date, the team's response and attached files.",
  })
  async list(@AuthContext() auth: AuthContextType, @Param('auditId') auditId: string) {
    const data = await this.requests.list({ auth, auditId });
    return { data, count: data.length };
  }

  @Post()
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'Request audit evidence',
    description:
      'An assigned auditor asks the team for evidence, optionally for one requirement (which is then marked requested) and with a due date.',
  })
  @ApiBody({ type: CreateAuditRequestDto })
  async create(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Body() body: CreateAuditRequestDto,
  ) {
    return this.requests.create({ auth, auditId, dto: body });
  }

  @Post('team')
  @RequirePermission('audit', 'update')
  @ApiOperation({
    summary: "Log the auditor's request list",
    description:
      "The team logs requests the auditor sent outside Comp AI (a PBC list by email or spreadsheet): one request or many, each optionally tied to a requirement, with a due date and an owner, who is notified.",
  })
  @ApiBody({ type: CreateTeamAuditRequestsDto })
  async createTeam(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Body() body: CreateTeamAuditRequestsDto,
  ) {
    return this.teamRequests.create({ auth, auditId, requests: body.requests });
  }

  @Patch(':requestId/response')
  @RequirePermission('audit', 'update')
  @ApiOperation({
    summary: 'Respond to an audit evidence request',
    description:
      "Saves the team's answer to an auditor's evidence request and marks it submitted for the auditor to review. Attach files with the attachments endpoint.",
  })
  @ApiParam({ name: 'requestId', example: 'aer_abc123' })
  @ApiBody({ type: RespondAuditRequestDto })
  async respond(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Param('requestId') requestId: string,
    @Body() body: RespondAuditRequestDto,
  ) {
    return this.requests.respond({ auth, auditId, requestId, dto: body });
  }

  @Patch(':requestId/status')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'Accept or reopen an audit evidence request',
    description:
      "An assigned auditor accepts the team's response to an evidence request, or reopens it when more is needed.",
  })
  @ApiParam({ name: 'requestId', example: 'aer_abc123' })
  @ApiBody({ type: DecideAuditRequestDto })
  async decide(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Param('requestId') requestId: string,
    @Body() body: DecideAuditRequestDto,
  ) {
    return this.requests.decide({ auth, auditId, requestId, dto: body });
  }

  @Post(':requestId/attachments')
  @RequirePermission('audit', 'update')
  @ApiOperation({
    summary: 'Attach a file to an audit evidence request',
    description:
      "Uploads a file as part of the team's response to an auditor's evidence request. Use s3Key from /v1/uploads/presign for large files.",
  })
  @ApiParam({ name: 'requestId', example: 'aer_abc123' })
  @ApiBody({ type: UploadAttachmentDto })
  async uploadFile(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Param('requestId') requestId: string,
    @Body() body: UploadAttachmentDto,
  ) {
    const userId = auth.isApiKey ? body.userId : auth.userId;
    if (!userId) {
      throw new BadRequestException(
        'User ID is required. With an API key, provide userId in the request body.',
      );
    }
    return this.requests.uploadFile({ auth, auditId, requestId, dto: body, userId });
  }
}
