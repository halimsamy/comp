import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { MemberComplianceService } from './member-compliance.service';

@ApiTags('People')
@Controller({ path: 'people-lifecycle', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class PeopleLifecycleController {
  constructor(private readonly complianceService: MemberComplianceService) {}

  @Get('members/:memberId/compliance')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: "Get a member's compliance checklist",
    description:
      'Returns one row per people-security obligation for a member (policies, training, role training, device, background check, onboarding, offboarding) with status and dates.',
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async getCompliance(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.complianceService.getCompliance({ organizationId, memberId });
  }

  @Get('members/:memberId/onboarding')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: "Get a member's onboarding checklist",
    description:
      "Returns a member's onboarding checklist with due dates from their start date, overdue flags, and items completed automatically from policies, training, device and background check.",
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async getOnboarding(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.complianceService.getChecklist({
      organizationId,
      memberId,
      kind: 'onboarding',
    });
  }

  @Get('members/:memberId/offboarding')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: "Get a member's offboarding checklist with SLA",
    description:
      "Returns a member's offboarding checklist with due dates counted from their offboard date and overdue flags, so departures are closed out on time.",
  })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async getOffboarding(
    @OrganizationId() organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.complianceService.getChecklist({
      organizationId,
      memberId,
      kind: 'offboarding',
    });
  }
}
