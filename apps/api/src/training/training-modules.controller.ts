import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import {
  CompleteTrainingModuleDto,
  CreateTrainingModuleDto,
  TrainingCycleCertificateDto,
  UpdateTrainingModuleDto,
} from './dto/training-module.dto';
import { TrainingHistoryService } from './training-history.service';
import { TrainingModulesService } from './training-modules.service';

@ApiTags('Training')
@Controller({ path: 'training', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class TrainingModulesController {
  constructor(
    private readonly modulesService: TrainingModulesService,
    private readonly historyService: TrainingHistoryService,
  ) {}

  @Get('modules')
  @RequirePermission('training', 'read')
  @ApiOperation({
    summary: 'List custom training modules',
    description:
      "Lists the organization's custom training modules (e.g. secure coding for developers, PCI DSS role training) with their role and department targeting and recurrence.",
  })
  async listModules(@OrganizationId() organizationId: string) {
    return this.modulesService.list(organizationId);
  }

  @Post('modules')
  @RequirePermission('training', 'update')
  @ApiOperation({
    summary: 'Create a custom training module',
    description:
      'Creates a training module assigned to members by role and/or department, such as secure coding training for developers (PCI DSS 6.2.2). Members retake it every recurrenceMonths.',
  })
  @ApiBody({ type: CreateTrainingModuleDto })
  async createModule(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateTrainingModuleDto,
  ) {
    return this.modulesService.create({ organizationId, dto });
  }

  @Patch('modules/:moduleId')
  @RequirePermission('training', 'update')
  @ApiOperation({
    summary: 'Update a custom training module',
    description:
      'Updates a training module: title, content link, framework reference, targeted roles or departments, recurrence, or whether it is enabled.',
  })
  @ApiParam({ name: 'moduleId', description: 'Training module ID' })
  @ApiBody({ type: UpdateTrainingModuleDto })
  async updateModule(
    @OrganizationId() organizationId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateTrainingModuleDto,
  ) {
    return this.modulesService.update({ organizationId, moduleId, dto });
  }

  @Delete('modules/:moduleId')
  @RequirePermission('training', 'update')
  @ApiOperation({
    summary: 'Disable a custom training module',
    description:
      'Stops assigning a training module to members. Completion history is kept as audit evidence, so the module is disabled rather than deleted.',
  })
  @ApiParam({ name: 'moduleId', description: 'Training module ID' })
  async disableModule(
    @OrganizationId() organizationId: string,
    @Param('moduleId') moduleId: string,
  ) {
    return this.modulesService.disable({ organizationId, moduleId });
  }

  @Get('members/:memberId/modules')
  @RequirePermission('training', 'read')
  @ApiOperation({
    summary: "Get a member's assigned training modules",
    description:
      'Returns the custom training modules assigned to a member with status (completed, expired, not_started), last completion date and expiry date.',
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async getMemberModules(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.modulesService.getMemberModules({ organizationId, memberId });
  }

  @Post('members/:memberId/modules/:moduleId/complete')
  @RequirePermission('training', 'update')
  @ApiOperation({
    summary: 'Record a training module completion',
    description:
      "Records that a member completed an assigned training module, e.g. instructor-led or external training. Starts a new cycle that expires after the module's recurrence.",
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiParam({ name: 'moduleId', description: 'Training module ID' })
  @ApiBody({ type: CompleteTrainingModuleDto })
  async completeModule(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: CompleteTrainingModuleDto,
  ) {
    return this.modulesService.completeModule({
      organizationId,
      memberId,
      moduleId,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
    });
  }

  @Get('members/:memberId/cycles')
  @RequirePermission('training', 'read')
  @ApiOperation({
    summary: "List a member's training cycles",
    description:
      'Lists every completed training cycle for a member (security awareness, HIPAA, custom modules), newest first, with completion and expiry dates. Each cycle has a certificate.',
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async getCycles(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.historyService.getCycles({ organizationId, memberId });
  }

  @Post('members/:memberId/cycles/certificate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('training', 'read')
  @ApiOperation({
    summary: 'Download a training cycle certificate',
    description:
      'Generates the PDF completion certificate for one training cycle of a member, identified by moduleId and completedAt from the cycles list.',
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  @ApiBody({ type: TrainingCycleCertificateDto })
  @ApiProduces('application/pdf')
  // Binary PDF response: hidden from MCP, kept for the web UI and direct API callers.
  @ApiExtension('x-speakeasy-mcp', { disabled: true })
  async getCycleCertificate(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
    @Body() dto: TrainingCycleCertificateDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.historyService.generateCycleCertificate({
      organizationId,
      memberId,
      moduleId: dto.moduleId,
      completedAt: new Date(dto.completedAt),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.pdf);
  }
}
