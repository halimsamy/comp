import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { buildRiskAssignmentFilter } from '../utils/assignment-filter';
import {
  BulkCreateRisksDto,
  CreateRiskReviewDto,
  ListRiskActionsQueryDto,
} from './dto/risk-workspace.dto';
import { loadRiskMethodologySettings } from './load-risk-methodology-settings';
import { RiskReviewsService } from './risk-reviews.service';
import { RiskSuggestionsService } from './risk-suggestions.service';
import { RiskWorkspaceService } from './risk-workspace.service';

/**
 * Register-wide risk management: library, AI suggestions, bulk add, the
 * treatment action tracker and periodic reviews (ISO 27001 6.1.2, 6.1.3, 8.2).
 * Lives under its own path so its static segments never collide with /risks/:id.
 */
@ApiTags('Risks')
@Controller({ path: 'risk-management', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class RiskWorkspaceController {
  constructor(
    private readonly workspace: RiskWorkspaceService,
    private readonly reviews: RiskReviewsService,
    private readonly suggestions: RiskSuggestionsService,
  ) {}

  @Get('settings')
  @RequirePermission('risk', 'read')
  @ApiOperation({
    summary: 'Get risk methodology settings',
    description:
      'Returns the settings the ISMS 6.1.2 Risk Assessment Methodology sets for the Risks module: the lowest residual level that needs risk-owner acceptance and the months between periodic risk reviews.',
  })
  async getSettings(@OrganizationId() organizationId: string) {
    return loadRiskMethodologySettings({ organizationId });
  }

  @Get('library')
  @RequirePermission('risk', 'read')
  @ApiOperation({
    summary: 'List risk library templates',
    description:
      'Returns common payment and fintech risk scenarios with ISO 27001 and PCI DSS references, flagged when already in the register. Use to add risks quickly.',
  })
  async getLibrary(@OrganizationId() organizationId: string) {
    return { data: await this.workspace.getLibrary(organizationId) };
  }

  @Post('risks/bulk')
  @RequirePermission('risk', 'create')
  @ApiOperation({
    summary: 'Add several risks at once',
    description:
      'Creates up to 50 risks from library templates or AI suggestions. Titles already in the register are skipped and returned in skipped.',
  })
  @ApiBody({ type: BulkCreateRisksDto })
  async bulkCreateRisks(
    @Body() body: BulkCreateRisksDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.workspace.bulkCreate({ organizationId, risks: body.risks });
  }

  @Post('suggestions')
  @RequirePermission('risk', 'create')
  @ApiOperation({
    summary: 'Suggest risks with AI',
    description:
      'Generates up to 8 new risk suggestions from the org vendors, devices, integrations and onboarding answers. Nothing is saved; add picks with POST /v1/risk-management/risks/bulk.',
  })
  async suggestRisks(@OrganizationId() organizationId: string) {
    return { data: await this.suggestions.suggest(organizationId) };
  }

  @Get('actions')
  @RequirePermission('risk', 'read')
  @ApiOperation({
    summary: 'List risk treatment actions',
    description:
      'Lists treatment actions across all risks with owner, due date, status and overdue flag. Use as the risk treatment plan tracker (ISO 27001 6.1.3, 8.3).',
  })
  async listActions(
    @Query() query: ListRiskActionsQueryDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const assignmentFilter = buildRiskAssignmentFilter(
      authContext.memberId,
      authContext.userRoles,
      { isApiKey: authContext.isApiKey },
    );
    return {
      data: await this.workspace.listActions({ organizationId, query, assignmentFilter }),
    };
  }

  @Get('reviews')
  @RequirePermission('risk', 'read')
  @ApiOperation({
    summary: 'List periodic risk reviews',
    description:
      'Returns the signed-off risk register reviews (ISO 27001 8.2), newest first, with the next due date and the 6.1.2 methodology settings.',
  })
  async listReviews(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    this.assertRegisterWideAccess(authContext);
    return this.reviews.list(organizationId);
  }

  @Get('reviews/:reviewId')
  @RequirePermission('risk', 'read')
  @ApiOperation({
    summary: 'Get a risk review',
    description:
      'Returns one periodic risk review with the frozen register snapshot (levels, owners, acceptance state, open actions) as it stood at sign-off.',
  })
  async getReview(
    @Param('reviewId') reviewId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    this.assertRegisterWideAccess(authContext);
    return this.reviews.get({ id: reviewId, organizationId });
  }

  @Post('reviews')
  @RequirePermission('risk', 'update')
  @ApiOperation({
    summary: 'Record a periodic risk review',
    description:
      'Signs off a review of the whole risk register (ISO 27001 8.2). Freezes the register and schedules the next review from the 6.1.2 interval.',
  })
  @ApiBody({ type: CreateRiskReviewDto })
  async createReview(
    @Body() body: CreateRiskReviewDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    this.assertRegisterWideAccess(authContext);
    return this.reviews.create({
      organizationId,
      callerMemberId: authContext.memberId,
      dto: body,
    });
  }

  /** Reviews cover every risk, so roles limited to their own risks cannot use them. */
  private assertRegisterWideAccess(authContext: AuthContextType) {
    const filter = buildRiskAssignmentFilter(
      authContext.memberId,
      authContext.userRoles,
      { isApiKey: authContext.isApiKey },
    );
    if (Object.keys(filter).length > 0) {
      throw new ForbiddenException('Risk reviews need access to the whole register');
    }
  }
}
