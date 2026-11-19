import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiExtension,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../../auth/types';
import { BulkSetOwnerDto, BulkSubmitForApprovalDto } from './policy-bulk.dto';
import { PolicyBulkService } from './policy-bulk.service';

@ApiTags('Policies')
@Controller({ path: 'policies/bulk', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class PolicyBulkController {
  constructor(private readonly bulkService: PolicyBulkService) {}

  @Post('submit-for-approval')
  @RequirePermission('policy', 'update')
  @ApiOperation({
    summary: 'Submit several policies for approval',
    description:
      'Sends each selected policy to the same approver as its own approval request: never-published policies submit their current draft, published ones their newest unpublished version. Policies already pending or without a new version are skipped with a reason.',
  })
  @ApiBody({ type: BulkSubmitForApprovalDto })
  @ApiExtension('x-speakeasy-mcp', { name: 'bulk-submit-policies-for-approval' })
  async submitForApproval(
    @Body() body: BulkSubmitForApprovalDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    return this.bulkService.submitForApproval({
      organizationId,
      policyIds: body.policyIds,
      approverId: body.approverId,
      actorMemberId: authContext.memberId,
    });
  }

  @Post('owner')
  @RequirePermission('policy', 'update')
  @ApiOperation({
    summary: 'Set the owner of several policies',
    description:
      'Makes one active member the accountable owner of every selected policy in the organization.',
  })
  @ApiBody({ type: BulkSetOwnerDto })
  @ApiExtension('x-speakeasy-mcp', { name: 'bulk-set-policy-owner' })
  async setOwner(
    @Body() body: BulkSetOwnerDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.bulkService.setOwner({
      organizationId,
      policyIds: body.policyIds,
      ownerId: body.ownerId,
    });
  }
}
