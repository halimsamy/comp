import {
  BadRequestException,
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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditRead } from '../audit/skip-audit-log.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { OrganizationId } from '../auth/auth-context.decorator';
import { ControlsBulkOwnerService } from './controls-bulk-owner.service';
import { loadControlEvidence } from './controls-evidence';
import { ControlsOverviewService } from './controls-overview.service';
import { suggestControlOwners } from './controls-owner-suggestions';
import { BulkControlOwnerDto } from './dto/bulk-owner.dto';
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
    private readonly bulkOwnerService: ControlsBulkOwnerService,
  ) {}

  @Get('evidence')
  @RequirePermission('control', 'read')
  @ApiOperation({
    summary: 'List the evidence behind controls',
    description:
      'Merges the policies, tasks, evidence forms and ISMS documents of the given controls, with status, owner and last update. Pass the controls mapped to a requirement to see everything that satisfies it.',
  })
  @ApiQuery({ name: 'controlIds', description: 'Comma-separated control IDs (max 200)', example: 'ctl_abc123,ctl_def456' })
  async evidence(
    @OrganizationId() organizationId: string,
    @Query('controlIds') controlIds?: string,
  ) {
    const ids = [...new Set((controlIds ?? '').split(',').map((id) => id.trim()).filter(Boolean))];
    if (ids.length > 200) throw new BadRequestException('Pass at most 200 control IDs');
    const data = ids.length > 0 ? await loadControlEvidence({ organizationId, controlIds: ids }) : [];
    return { data, count: data.length };
  }

  @Get('owner-suggestions')
  @RequirePermission('control', 'read')
  @ApiOperation({
    summary: 'Suggest control owners from ISMS roles',
    description:
      'For each control without an active owner, suggests the ISMS role holder for its theme (A.5 SPO, A.6 HR, A.8 CTO, PCI 12 executive owner). Nothing is saved.',
  })
  async ownerSuggestions(@OrganizationId() organizationId: string) {
    return suggestControlOwners(organizationId);
  }

  @Patch('bulk-owner')
  @RequirePermission('control', 'update')
  @ApiOperation({
    summary: 'Set the owner of many controls',
    description:
      'Assigns (or clears) the owner of up to 500 controls in one transaction. With assignLinkedWork, linked tasks and policies with no assignee are assigned to the new owner too.',
  })
  @ApiBody({ type: BulkControlOwnerDto })
  async bulkOwner(@OrganizationId() organizationId: string, @Body() dto: BulkControlOwnerDto) {
    return this.bulkOwnerService.setOwner({ organizationId, dto });
  }

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
