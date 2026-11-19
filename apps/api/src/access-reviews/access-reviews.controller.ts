import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExtension,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { AccessReviewEvidenceService } from './access-review-evidence.service';
import { AccessReviewsService } from './access-reviews.service';
import {
  CreateAccessReviewDto,
  DecideAccessReviewItemsDto,
  RemediateAccessReviewItemDto,
  SignOffAccessReviewDto,
} from './dto/access-reviews.dto';

/** User access reviews (ISO 27001 A.5.18; PCI DSS 7.2.4, 7.2.5.1, 8.2.6). */
@ApiTags('Access')
@Controller({ path: 'access-reviews', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class AccessReviewsController {
  constructor(
    private readonly reviews: AccessReviewsService,
    private readonly evidence: AccessReviewEvidenceService,
  ) {}

  @Get()
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'List access reviews',
    description:
      'Returns user access reviews with status, due date, systems, reviewers and decision progress.',
  })
  async list(@OrganizationId() organizationId: string) {
    const data = await this.reviews.list(organizationId);
    return { data, count: data.length };
  }

  @Post()
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Start an access review',
    description:
      'Snapshots the accounts of the chosen systems, with pre-flags for departed owners, unmapped, admin, no-MFA and inactive accounts, and assigns a reviewer per system.',
  })
  @ApiBody({ type: CreateAccessReviewDto })
  async create(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Body() body: CreateAccessReviewDto,
  ) {
    return this.reviews.create({
      organizationId,
      callerMemberId: authContext.memberId,
      dto: body,
    });
  }

  @Get(':id')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'Get an access review',
    description:
      'Returns one access review with its systems, every account snapshot, flags, decisions and remediation status.',
  })
  @ApiParam({ name: 'id', description: 'Access review id' })
  async get(@OrganizationId() organizationId: string, @Param('id') id: string) {
    return this.reviews.get({ organizationId, id });
  }

  @Post(':id/decisions')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Record access review decisions',
    description:
      'Sets keep, revoke or modify on accounts of an open access review. With several ids only undecided accounts change. Modify, and keeping a flagged account, need a note. Reviewers cannot decide on their own account or on a system assigned to someone else. Every decision is written to the audit log.',
  })
  @ApiParam({ name: 'id', description: 'Access review id' })
  @ApiBody({ type: DecideAccessReviewItemsDto })
  async decide(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('id') id: string,
    @Body() body: DecideAccessReviewItemsDto,
  ) {
    return this.reviews.decide({
      organizationId,
      id,
      callerMemberId: authContext.memberId,
      userId: authContext.userId,
      dto: body,
    });
  }

  @Post(':id/items/:itemId/remediation')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Mark an access change as done',
    description:
      'Records that a revoke or modify decision was carried out in the system, with an optional note, ticket link and proof file.',
  })
  @ApiParam({ name: 'id', description: 'Access review id' })
  @ApiParam({ name: 'itemId', description: 'Access review item id' })
  @ApiBody({ type: RemediateAccessReviewItemDto })
  async remediate(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: RemediateAccessReviewItemDto,
  ) {
    return this.reviews.remediate({
      organizationId,
      id,
      itemId,
      userId: authContext.userId,
      dto: body,
    });
  }

  @Post(':id/sign-off')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Sign off an access review',
    description:
      'Management acknowledges access remains appropriate. Needs every account decided and every change done, and a signer who neither started the review nor owns an account in it. Attaches the PDF to the Access Review Log task (sent for approval when the task has an approver).',
  })
  @ApiParam({ name: 'id', description: 'Access review id' })
  @ApiBody({ type: SignOffAccessReviewDto })
  async signOff(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('id') id: string,
    @Body() body: SignOffAccessReviewDto,
  ) {
    return this.reviews.signOff({
      organizationId,
      id,
      callerMemberId: authContext.memberId,
      userId: authContext.userId,
      note: body.note,
    });
  }

  @Delete(':id')
  @RequirePermission('member', 'update')
  @ApiOperation({
    summary: 'Delete an open access review',
    description:
      'Deletes an access review that has not been signed off. Signed-off reviews are kept as evidence.',
  })
  @ApiParam({ name: 'id', description: 'Access review id' })
  async remove(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
  ) {
    return this.reviews.remove({ organizationId, id });
  }

  @Get(':id/report')
  @RequirePermission('member', 'read')
  @ApiOperation({
    summary: 'Download the access review report',
    description:
      'Generates the PDF report of an access review: scope, reviewers, every account with its decision, access changes and the management sign-off.',
  })
  @ApiParam({ name: 'id', description: 'Access review id' })
  @ApiProduces('application/pdf')
  // Binary PDF response: hidden from MCP, kept for the web UI and direct API callers.
  @ApiExtension('x-speakeasy-mcp', { disabled: true })
  async report(
    @OrganizationId() organizationId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.evidence.report({
      organizationId,
      id,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
