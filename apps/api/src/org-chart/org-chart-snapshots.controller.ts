import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { CreateOrgChartSnapshotDto } from './dto/create-org-chart-snapshot.dto';
import { OrgChartSnapshotsService } from './org-chart-snapshots.service';

@ApiTags('Org Chart')
@Controller({ path: 'org-chart/snapshots', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class OrgChartSnapshotsController {
  constructor(private readonly snapshotsService: OrgChartSnapshotsService) {}

  @Get()
  @RequirePermission('organization', 'read')
  @ApiOperation({
    summary: 'List org chart snapshots',
    description:
      'Lists the dated snapshots of the organization chart, newest first, so auditors can see roles and reporting lines as they were at a point in time.',
  })
  async list(@OrganizationId() organizationId: string) {
    return this.snapshotsService.list(organizationId);
  }

  @Get(':snapshotId')
  @RequirePermission('organization', 'read')
  @ApiOperation({
    summary: 'Get an org chart snapshot',
    description: 'Returns one dated org chart snapshot with its nodes and edges, to view or export the chart as it was.',
  })
  @ApiParam({ name: 'snapshotId', description: 'Snapshot ID' })
  async get(
    @OrganizationId() organizationId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.snapshotsService.get({ organizationId, snapshotId });
  }

  @Post()
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Save an org chart snapshot',
    description:
      'Saves an immutable, dated copy of the current interactive org chart as audit evidence of roles and responsibilities (ISO 27001 clause 5.3).',
  })
  @ApiBody({ type: CreateOrgChartSnapshotDto })
  async create(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() dto: CreateOrgChartSnapshotDto,
  ) {
    return this.snapshotsService.create({
      organizationId,
      name: dto.name,
      createdById: authContext.userId,
    });
  }
}
