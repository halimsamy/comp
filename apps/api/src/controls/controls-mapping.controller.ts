import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditRead } from '../audit/skip-audit-log.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { OrganizationId } from '../auth/auth-context.decorator';
import { ControlsOverviewService } from './controls-overview.service';
import { RelatedControlsService } from './related-controls.service';
import {
  LinkRelatedControlsDto,
  RelatedEntityQueryDto,
  UpdateControlOwnerDto,
} from './dto/related-controls.dto';

/**
 * Cross-framework control views: the org-wide controls list (ISO ↔ PCI crosswalk)
 * and the "related controls" panel shown on policy, task, form and ISMS pages.
 * Registered before ControlsController so `/controls/overview` is not read as `/controls/:id`.
 */
@ApiTags('Controls')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionGuard)
@Controller({ path: 'controls', version: '1' })
export class ControlsMappingController {
  constructor(
    private readonly overviewService: ControlsOverviewService,
    private readonly relatedService: RelatedControlsService,
  ) {}

  @Get('overview')
  @RequirePermission('control', 'read')
  @ApiOperation({
    summary: 'List controls with framework requirement codes',
    description:
      'Returns every control with its ISO 27001 / PCI DSS (and other framework) requirement codes, owner and evidence status. Use as the ISO-to-PCI crosswalk.',
  })
  async overview(@OrganizationId() organizationId: string) {
    return this.overviewService.list(organizationId);
  }

  @Get('crosswalk')
  @RequirePermission('control', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export the control crosswalk as CSV',
    description:
      'Download every control with its requirement codes per framework (ISO 27001 ↔ PCI DSS crosswalk), owner, status and evidence counts as CSV.',
  })
  @ApiResponse({ status: 200, description: 'Control crosswalk CSV' })
  async crosswalk(@OrganizationId() organizationId: string, @Res() res: Response) {
    const csv = await this.overviewService.crosswalkCsv(organizationId);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="control-crosswalk-${date}.csv"`);
    res.send(csv);
  }

  @Get('related')
  @RequirePermission('control', 'read')
  @ApiOperation({
    summary: 'List controls linked to a piece of evidence',
    description:
      'Returns the controls a policy, task, evidence form or ISMS document satisfies, with the requirement codes per framework it counts for (e.g. ISO A.5.15, PCI 7.2.1).',
  })
  async related(
    @OrganizationId() organizationId: string,
    @Query() query: RelatedEntityQueryDto,
  ) {
    return this.relatedService.list({ organizationId, ...query });
  }

  @Post('related')
  @RequirePermission('control', 'update')
  @ApiOperation({
    summary: 'Link controls to a piece of evidence',
    description:
      'Links controls to a policy, task, evidence form or ISMS document. The link counts for every framework that maps the control (evidence once, map many).',
  })
  @ApiBody({ type: LinkRelatedControlsDto })
  async link(@OrganizationId() organizationId: string, @Body() dto: LinkRelatedControlsDto) {
    return this.relatedService.link({ organizationId, ...dto });
  }

  @Delete('related/:controlId')
  @RequirePermission('control', 'update')
  @ApiOperation({
    summary: 'Unlink a control from a piece of evidence',
    description:
      'Removes the link between a control and a policy, task, evidence form or ISMS document, for every framework.',
  })
  @ApiParam({ name: 'controlId', example: 'ctl_abc123' })
  async unlink(
    @OrganizationId() organizationId: string,
    @Param('controlId') controlId: string,
    @Query() query: RelatedEntityQueryDto,
  ) {
    return this.relatedService.unlink({ organizationId, controlId, ...query });
  }

  @Patch(':id/owner')
  @RequirePermission('control', 'update')
  @ApiOperation({
    summary: 'Set the owner of a control',
    description: 'Assigns a member as the accountable owner of a control, or clears it with null.',
  })
  @ApiParam({ name: 'id', example: 'ctl_abc123' })
  @ApiBody({ type: UpdateControlOwnerDto })
  async setOwner(
    @OrganizationId() organizationId: string,
    @Param('id') controlId: string,
    @Body() dto: UpdateControlOwnerDto,
  ) {
    return this.overviewService.setOwner({
      organizationId,
      controlId,
      ownerId: dto.ownerId ?? null,
    });
  }
}
