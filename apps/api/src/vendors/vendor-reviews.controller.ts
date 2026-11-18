import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ActingUserResolver } from '../auth/acting-user.service';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type {
  AuthContext as AuthContextType,
  AuthenticatedRequest,
} from '../auth/types';
import { CreateVendorReviewDto } from './dto/vendor-review.dto';
import { authMeta } from './tpsp/auth-meta';
import { VendorReviewsService } from './vendor-reviews.service';

const VENDOR_ID = {
  name: 'id',
  description: 'Vendor ID',
  example: 'vnd_abc123',
};

/** Periodic vendor reviews with sign-off (ISO 27001 A.5.22, PCI DSS 12.8.4). */
@ApiTags('Vendors')
@Controller({ path: 'vendors', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class VendorReviewsController {
  constructor(
    private readonly reviews: VendorReviewsService,
    private readonly actingUser: ActingUserResolver,
  ) {}

  @Get(':id/reviews')
  @RequirePermission('vendor', 'read')
  @ApiOperation({
    summary: 'List vendor reviews',
    description:
      'Returns the signed-off periodic reviews of a vendor, newest first: outcome, checklist, reviewer and next due date. Use as ISO 27001 A.5.22 / PCI DSS 12.8.4 evidence.',
  })
  @ApiParam(VENDOR_ID)
  async listVendorReviews(
    @Param('id') vendorId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const data = await this.reviews.list({ vendorId, organizationId });
    return { data, count: data.length, ...authMeta(authContext) };
  }

  @Post(':id/reviews')
  @RequirePermission('vendor', 'update')
  @ApiOperation({
    summary: 'Sign off a vendor review',
    description:
      'Records a completed periodic vendor review with outcome and checklist, sets the next review date from the vendor criticality and closes the open review reminder.',
  })
  @ApiParam(VENDOR_ID)
  @ApiBody({ type: CreateVendorReviewDto })
  async signOffVendorReview(
    @Param('id') vendorId: string,
    @Body() dto: CreateVendorReviewDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Req() req: AuthenticatedRequest,
  ) {
    const acting = await this.actingUser.resolve(req, organizationId);
    if (!acting.userId) {
      throw new BadRequestException(
        'Cannot attribute this review — your organization must have at least one active user with the "owner" role.',
      );
    }
    const review = await this.reviews.signOff({
      vendorId,
      organizationId,
      dto,
      userId: acting.userId,
    });
    return { ...review, ...authMeta(authContext) };
  }
}
