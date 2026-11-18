import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { SkipChecklistItemDto } from './dto/skip-checklist-item.dto';
import { OnboardingChecklistService } from './onboarding-checklist.service';

@ApiTags('Onboarding')
@Controller({ path: 'onboarding/checklist', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class OnboardingChecklistController {
  constructor(private readonly checklistService: OnboardingChecklistService) {}

  @Get()
  @RequirePermission('app', 'read')
  @ApiOperation({
    summary: 'Get the Getting Started checklist',
    description:
      'Returns the setup checklist (systems, policies, ISMS and SoA, people, risks, vendors, evidence, auditor) computed from live data, with progress, locks and deep links.',
  })
  async getChecklist(@OrganizationId() organizationId: string) {
    return this.checklistService.getChecklist(organizationId);
  }

  @Put('items/:itemId/skip')
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Skip a Getting Started step',
    description:
      'Marks a setup checklist step as skipped with a reason, e.g. when the company has no cloud provider. Skipped steps count as resolved.',
  })
  @ApiParam({
    name: 'itemId',
    description: 'Checklist item ID, e.g. version_control',
  })
  @ApiBody({ type: SkipChecklistItemDto })
  async skipItem(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('itemId') itemId: string,
    @Body() dto: SkipChecklistItemDto,
  ) {
    return this.checklistService.skipItem({
      organizationId,
      itemId,
      reason: dto.reason,
      skippedById: authContext.userId ?? null,
    });
  }

  @Delete('items/:itemId/skip')
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Restore a skipped Getting Started step',
    description:
      'Removes the skip from a setup checklist step so it counts toward progress again.',
  })
  @ApiParam({
    name: 'itemId',
    description: 'Checklist item ID, e.g. version_control',
  })
  async unskipItem(
    @OrganizationId() organizationId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.checklistService.unskipItem({ organizationId, itemId });
  }
}
