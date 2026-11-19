import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../../auth/types';
import { SetRequirementApplicabilityDto } from './dto/set-requirement-applicability.dto';
import { RequirementApplicabilityService } from './requirement-applicability.service';

@ApiTags('Frameworks')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionGuard)
@Controller({ path: 'frameworks', version: '1' })
export class RequirementApplicabilityController {
  constructor(private readonly service: RequirementApplicabilityService) {}

  @Get(':id/applicability')
  @RequirePermission('framework', 'read')
  @ApiOperation({
    summary: 'List requirement applicability for a framework',
    description:
      'Returns which requirements of a framework instance are not applicable, met by compensating controls or by the customized approach, with justifications (ISO SoA, PCI ROC N/A column).',
  })
  async list(@OrganizationId() organizationId: string, @Param('id') id: string) {
    return this.service.list({ organizationId, frameworkInstanceId: id });
  }

  @Put(':id/requirements/:requirementKey/applicability')
  @RequirePermission('framework', 'update')
  @ApiOperation({
    summary: 'Set requirement applicability',
    description:
      'Marks a framework requirement applicable, not applicable, or (PCI DSS) met by compensating controls or the customized approach. A justification is required unless applicable; compensating and customized need their PCI worksheet in `details`. ISO 27001 Annex A changes are written to the Statement of Applicability. `applyToChildren` cascades N/A to sub-requirements. Scoring excludes N/A.',
  })
  @ApiBody({ type: SetRequirementApplicabilityDto })
  async set(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('id') id: string,
    @Param('requirementKey') requirementKey: string,
    @Body() dto: SetRequirementApplicabilityDto,
  ) {
    return this.service.set({
      organizationId,
      frameworkInstanceId: id,
      requirementKey,
      memberId: authContext.memberId ?? null,
      userId: authContext.userId ?? null,
      dto,
    });
  }
}
