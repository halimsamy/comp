import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { MemberId, OrganizationId } from '@/auth/auth-context.decorator';
import { HybridAuthGuard } from '@/auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { IsmsReadinessService } from './isms-readiness.service';
import { IsmsRoleAssignmentService } from './isms-role-assignment.service';
import { RecordComputedMetricsDto } from './dto/record-computed-metrics.dto';
import {
  previewComputedMetrics,
  recordComputedMetrics,
} from './documents/metric-automation';

/**
 * ISMS automation: the guided readiness checklist, 9.1 metrics computed from
 * platform data, and role-holder acknowledgement (5.3 / PCI 12.4.1).
 */
@ApiTags('ISMS')
@Controller({ path: 'isms', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class IsmsAutomationController {
  constructor(
    private readonly readinessService: IsmsReadinessService,
    private readonly roleAssignmentService: IsmsRoleAssignmentService,
  ) {}

  @Get('readiness')
  @RequirePermission('evidence', 'read')
  @ApiOperation({
    summary: 'Get ISMS readiness by clause',
    description:
      'Returns, for each ISO 27001 clause 4-10 document, a checklist of what is done and what is missing, with a completion percentage and open nonconformity counts.',
  })
  @ApiQuery({ name: 'frameworkId', description: 'ISO 27001 framework id', example: 'frk_abc123' })
  @ApiOkResponse({ description: 'Per-document readiness checklist' })
  async getReadiness(
    @Query('frameworkId') frameworkId: string | undefined,
    @OrganizationId() organizationId: string,
  ) {
    if (!frameworkId?.trim()) {
      throw new BadRequestException('frameworkId is required');
    }
    return this.readinessService.getReadiness({ organizationId, frameworkId });
  }

  @Get('documents/:id/metrics/computed')
  @RequirePermission('evidence', 'read')
  @ApiOperation({
    summary: 'Preview computed ISMS metrics',
    description:
      'Returns the current value of every 9.1 metric Comp AI measures itself (training, policy acknowledgement, findings, risk treatment, vendor reviews, task on-time rate).',
  })
  @ApiOkResponse({ description: 'Computed metric values' })
  async previewMetrics(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return previewComputedMetrics({ documentId: id, organizationId });
  }

  @Post('documents/:id/metrics/computed/record')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('evidence', 'update')
  @ApiOperation({
    summary: 'Record computed ISMS metrics',
    description:
      'Records the computed 9.1 metric values as measurements for the chosen period. Metrics that already have a value for that period are skipped.',
  })
  @ApiBody({ type: RecordComputedMetricsDto })
  @ApiOkResponse({ description: 'Number of measurements recorded' })
  async recordMetrics(
    @Param('id') id: string,
    @Body() dto: RecordComputedMetricsDto,
    @OrganizationId() organizationId: string,
    @MemberId() memberId: string | undefined,
  ) {
    return recordComputedMetrics({
      documentId: id,
      organizationId,
      memberId: memberId ?? null,
      period: dto.period ?? 'current',
    });
  }

  @Post('role-assignments/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('evidence', 'read')
  @ApiOperation({
    summary: 'Acknowledge an ISMS role',
    description:
      'Records that the signed-in member accepts the ISMS governance role assigned to them (ISO 27001 5.3, PCI DSS 12.4.1). Only the assignee can acknowledge.',
  })
  @ApiOkResponse({ description: 'Acknowledged role assignment' })
  async acknowledgeRole(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
    @MemberId() memberId: string | undefined,
  ) {
    return this.roleAssignmentService.acknowledge({
      assignmentId: id,
      organizationId,
      memberId,
    });
  }
}
