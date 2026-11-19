import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { ReminderSettingsDto, SendRemindersDto } from './dto/reminders.dto';
import { sendSecurityTaskReminders } from './employee-reminders';
import { MemberComplianceService } from './member-compliance.service';
import { getReminderFrequency, setReminderFrequency } from './reminder-settings';

@ApiTags('People')
@Controller({ path: 'people-lifecycle', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class PeopleLifecycleController {
  constructor(private readonly complianceService: MemberComplianceService) {}

  @Get('compliance')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'Get people compliance for every member',
    description:
      'Returns, per member, the status of policies, security and role-based training, device, background check, onboarding and offboarding, plus one overall status. Respects the organization device and background-check settings; former members are only measured on offboarding.',
  })
  async getOrgCompliance(@OrganizationId() organizationId: string) {
    const data = await this.complianceService.getOrgCompliance({ organizationId });
    return { data, count: data.length };
  }

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

  @Post('reminders')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Send security task reminders',
    description:
      'Emails "Your security tasks" (policies to accept, training, device) to the given members, or to everyone with open tasks. Members with nothing open are skipped. Each email is written to the audit log.',
  })
  @ApiBody({ type: SendRemindersDto })
  async sendReminders(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() body: SendRemindersDto,
  ) {
    return sendSecurityTaskReminders({
      organizationId,
      memberIds: body.memberIds,
      actor: authContext.userId
        ? { userId: authContext.userId, memberId: authContext.memberId }
        : undefined,
    });
  }

  @Get('reminder-settings')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'Get the employee reminder schedule',
    description: 'Returns how often employees get the "Your security tasks" email: off, weekly or daily.',
  })
  async getReminderSettings(@OrganizationId() organizationId: string) {
    return { frequency: await getReminderFrequency(organizationId) };
  }

  @Put('reminder-settings')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Set the employee reminder schedule',
    description: 'Sets how often employees get the "Your security tasks" email: off, weekly or daily.',
  })
  @ApiBody({ type: ReminderSettingsDto })
  async setReminderSettings(@OrganizationId() organizationId: string, @Body() body: ReminderSettingsDto) {
    return setReminderFrequency({ organizationId, frequency: body.frequency });
  }
}
