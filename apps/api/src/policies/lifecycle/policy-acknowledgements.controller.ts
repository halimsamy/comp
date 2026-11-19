import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { PolicyAcknowledgementsService } from './policy-acknowledgements.service';

@ApiTags('Policies')
@Controller({ path: 'policy-acknowledgements', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class PolicyAcknowledgementsController {
  constructor(
    private readonly acknowledgementsService: PolicyAcknowledgementsService,
  ) {}

  @Get('export')
  @RequirePermission('policy', 'read')
  @ApiOperation({
    summary: 'Export policy acknowledgements as CSV',
    description:
      'Returns CSV text with one row per employee who must acknowledge each policy: status (Acknowledged, Pending, Outdated), current and acknowledged version, acknowledgement and last reminder time, owner and approval. Without policyId it covers every in-force policy that requires sign-off. Filter by policyId or memberId. Use as audit evidence of policy sign-off.',
  })
  @ApiQuery({ name: 'policyId', required: false, example: 'pol_abc123def456' })
  @ApiQuery({ name: 'memberId', required: false, example: 'mem_abc123def456' })
  async exportCsv(
    @OrganizationId() organizationId: string,
    @Query('policyId') policyId?: string,
    @Query('memberId') memberId?: string,
  ) {
    return this.acknowledgementsService.exportCsv({
      organizationId,
      policyId: policyId || undefined,
      memberId: memberId || undefined,
    });
  }

  @Get()
  @RequirePermission('policy', 'read')
  @ApiOperation({
    summary: 'List an employee policy acknowledgements',
    description:
      'Returns which policy versions an employee acknowledged and when, newest first. Use to check one person’s policy sign-off history.',
  })
  @ApiQuery({ name: 'memberId', required: true, example: 'mem_abc123def456' })
  async listForMember(
    @OrganizationId() organizationId: string,
    @Query('memberId') memberId: string,
  ) {
    const data = await this.acknowledgementsService.listForMember({
      memberId,
      organizationId,
    });
    return { data, count: data.length };
  }
}
