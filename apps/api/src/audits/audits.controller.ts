import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { AuditsService } from './audits.service';
import { CreateAuditDto, UpdateAuditDto } from './dto/audits.dto';

/** External audit engagements (ISO 27001 certification body, PCI DSS QSA). */
@ApiTags('Audits')
@Controller({ path: 'audits', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AuditsController {
  constructor(private readonly audits: AuditsService) {}

  @Get()
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'List audits',
    description:
      'Returns external audits with framework, firm, auditors, audit period, access end date and review progress. Auditors only see audits they are assigned to.',
  })
  async list(@AuthContext() auth: AuthContextType) {
    const data = await this.audits.list(auth);
    return { data, count: data.length };
  }

  @Post()
  @RequirePermission('audit', 'create')
  @ApiOperation({
    summary: 'Create an audit',
    description:
      'Creates an audit engagement for a framework with its audit period, firm, auditors (members with the auditor role) and the date auditor access ends.',
  })
  @ApiBody({ type: CreateAuditDto })
  async create(@AuthContext() auth: AuthContextType, @Body() body: CreateAuditDto) {
    return this.audits.create({ auth, dto: body });
  }

  @Get(':auditId')
  @RequirePermission('audit', 'read')
  @ApiOperation({
    summary: 'Get an audit',
    description:
      'Returns one audit engagement with its framework, auditors, audit period, access end date and how many requirements are accepted, flagged or requested.',
  })
  @ApiParam({ name: 'auditId', example: 'aud_abc123' })
  async get(@AuthContext() auth: AuthContextType, @Param('auditId') auditId: string) {
    return this.audits.get({ auth, auditId });
  }

  @Patch(':auditId')
  @RequirePermission('audit', 'update')
  @ApiOperation({
    summary: 'Update an audit',
    description:
      'Changes an audit engagement: title, firm, status, audit period, access end date or the auditors assigned to it.',
  })
  @ApiParam({ name: 'auditId', example: 'aud_abc123' })
  @ApiBody({ type: UpdateAuditDto })
  async update(
    @AuthContext() auth: AuthContextType,
    @Param('auditId') auditId: string,
    @Body() body: UpdateAuditDto,
  ) {
    return this.audits.update({ auth, auditId, dto: body });
  }

  @Delete(':auditId')
  @RequirePermission('audit', 'update')
  @ApiOperation({
    summary: 'Delete an audit',
    description:
      'Deletes an audit engagement with its assessments, comments and evidence requests. The evidence itself is not touched.',
  })
  @ApiParam({ name: 'auditId', example: 'aud_abc123' })
  async remove(@AuthContext() auth: AuthContextType, @Param('auditId') auditId: string) {
    return this.audits.remove({ auth, auditId });
  }
}
