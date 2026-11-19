import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExtension,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthContext, MemberId, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import {
  ImportTrainingRecordsDto,
  MyCertificateDto,
  RecordTrainingDto,
} from './dto/training-records.dto';
import { TrainingHistoryService } from './training-history.service';
import { listTrainingRecords, TrainingRecordsService } from './training-records.service';

/** Training completed outside the portal, and the organization's training record (PCI DSS 12.6.3). */
@ApiTags('Training')
@Controller({ path: 'training', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class TrainingRecordsController {
  constructor(
    private readonly records: TrainingRecordsService,
    private readonly history: TrainingHistoryService,
  ) {}

  @Post('me/certificate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('portal', 'read')
  @ApiOperation({
    summary: 'Download my latest training certificate',
    description:
      "Generates the signed-in member's certificate for their latest completed cycle of a training (security awareness by default), with validity, certificate ID, requirement and modules.",
  })
  @ApiBody({ type: MyCertificateDto })
  @ApiProduces('application/pdf')
  // Binary PDF response: hidden from MCP, kept for the portal.
  @ApiExtension('x-speakeasy-mcp', { disabled: true })
  async myCertificate(
    @OrganizationId() organizationId: string,
    @MemberId() memberId: string | undefined,
    @Body() body: MyCertificateDto,
    @Res() res: Response,
  ): Promise<void> {
    if (!memberId) throw new BadRequestException('Session authentication required');
    const moduleId = body.moduleId ?? 'general';
    const cycle = (await this.history.getCycles({ organizationId, memberId })).find(
      (c) => c.moduleId === moduleId,
    );
    if (!cycle) throw new BadRequestException('No completed training to certify yet');
    const result = await this.history.generateCycleCertificate({
      organizationId,
      memberId,
      moduleId,
      completedAt: cycle.completedAt,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.pdf);
  }

  @Get('records')
  @RequirePermission('training', 'read')
  @ApiOperation({
    summary: 'List training records',
    description:
      'Returns every training completion in the organization (security awareness, HIPAA and role-based modules) with member, date, expiry and source (portal, admin, import).',
  })
  async list(@OrganizationId() organizationId: string) {
    const data = await listTrainingRecords(organizationId);
    return { data, count: data.length };
  }

  @Post('members/:memberId/records')
  @RequirePermission('training', 'update')
  @ApiOperation({
    summary: 'Record a completed training',
    description:
      'Records training a member completed outside the portal, on a given date (not in the future), with an optional certificate. Security awareness and HIPAA records count as the member being trained.',
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiBody({ type: RecordTrainingDto })
  async record(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('memberId') memberId: string,
    @Body() body: RecordTrainingDto,
  ) {
    return this.records.record({ organizationId, memberId, userId: authContext.userId, dto: body });
  }

  @Post('records/import')
  @RequirePermission('training', 'update')
  @ApiOperation({
    summary: 'Import training records',
    description:
      'Imports completions from a CSV export (email, training, completion date). Rows that do not match a member or training are returned as errors; the others are recorded.',
  })
  @ApiBody({ type: ImportTrainingRecordsDto })
  async import(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() body: ImportTrainingRecordsDto,
  ) {
    return this.records.import({ organizationId, userId: authContext.userId, rows: body.rows });
  }
}
