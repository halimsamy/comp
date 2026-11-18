import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExtension,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../../auth/types';
import { POLICY_PARAMS } from '../schemas/policy-params';
import { PolicyAcknowledgementsService } from './policy-acknowledgements.service';
import { PolicyDocumentControlService } from './policy-document-control.service';
import { CreatePolicyReviewDto } from './policy-lifecycle.dto';
import { PolicyReviewsService } from './policy-reviews.service';

@ApiTags('Policies')
@Controller({ path: 'policies', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class PolicyLifecycleController {
  constructor(
    private readonly reviewsService: PolicyReviewsService,
    private readonly acknowledgementsService: PolicyAcknowledgementsService,
    private readonly documentControlService: PolicyDocumentControlService,
  ) {}

  @Get(':id/reviews')
  @RequirePermission('policy', 'read')
  @ApiOperation({
    summary: 'List policy reviews',
    description:
      'Returns the periodic review history of a policy, newest first: who reviewed it, when, their notes and the next review date. Use as evidence of planned-interval policy reviews.',
  })
  @ApiParam(POLICY_PARAMS.policyId)
  @ApiExtension('x-speakeasy-mcp', { name: 'list-policy-reviews' })
  async listReviews(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    const data = await this.reviewsService.list({
      policyId: id,
      organizationId,
    });
    return { data, count: data.length };
  }

  @Post(':id/reviews')
  @RequirePermission('policy', 'update')
  @ApiOperation({
    summary: 'Record a policy review',
    description:
      'Marks a published policy as reviewed without changing its content. Employee acknowledgements are kept unless requireReacknowledgement is true. Sets the next review date and clears the needs-review state.',
  })
  @ApiParam(POLICY_PARAMS.policyId)
  @ApiBody({ type: CreatePolicyReviewDto })
  @ApiExtension('x-speakeasy-mcp', { name: 'record-policy-review' })
  async recordReview(
    @Param('id') id: string,
    @Body() body: CreatePolicyReviewDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    return this.reviewsService.record({
      policyId: id,
      organizationId,
      reviewerId: authContext.memberId,
      notes: body.notes,
      nextReviewDate: body.nextReviewDate,
      requireReacknowledgement: body.requireReacknowledgement,
    });
  }

  @Get(':id/acknowledgements')
  @RequirePermission('policy', 'read')
  @ApiOperation({
    summary: 'List policy acknowledgements',
    description:
      'Returns who must acknowledge a policy, who has acknowledged the current version and when, and the full acknowledgement history across versions.',
  })
  @ApiParam(POLICY_PARAMS.policyId)
  @ApiExtension('x-speakeasy-mcp', { name: 'list-policy-acknowledgements' })
  async listAcknowledgements(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.acknowledgementsService.listForPolicy({
      policyId: id,
      organizationId,
    });
  }

  @Post(':id/acknowledgements/remind')
  @RequirePermission('policy', 'update')
  @ApiOperation({
    summary: 'Remind employees to acknowledge a policy',
    description:
      'Emails every employee who has not yet acknowledged the current published version of a policy. Sends at most one reminder per employee per day.',
  })
  @ApiParam(POLICY_PARAMS.policyId)
  @ApiExtension('x-speakeasy-mcp', { name: 'remind-policy-acknowledgements' })
  async remindAcknowledgements(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.acknowledgementsService.remindPending({
      policyId: id,
      organizationId,
    });
  }

  @Get(':id/document-control')
  @RequirePermission('policy', 'read')
  @ApiOperation({
    summary: 'Get policy document control',
    description:
      'Returns the document-control block for a policy PDF: owner, version, approver, approval date, effective date, last and next review, plus the organization name and logo.',
  })
  @ApiParam(POLICY_PARAMS.policyId)
  @ApiExtension('x-speakeasy-mcp', { name: 'get-policy-document-control' })
  async getDocumentControl(
    @Param('id') id: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.documentControlService.get({ policyId: id, organizationId });
  }
}
