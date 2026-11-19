import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
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
import {
  ArchiveVendorDto,
  BulkUpdateVendorsDto,
} from './dto/bulk-update-vendors.dto';
import { authMeta } from './tpsp/auth-meta';
import { VendorRegisterService } from './vendor-register.service';

const VENDOR_ID = {
  name: 'id',
  description: 'Vendor ID',
  example: 'vnd_abc123',
};

/** Bulk classification / import and archiving of vendors (ISO 27001 A.5.19, PCI DSS 12.8.1). */
@ApiTags('Vendors')
@Controller({ path: 'vendors', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class VendorRegisterController {
  constructor(private readonly register: VendorRegisterService) {}

  @Post('bulk-update')
  @RequirePermission('vendor', 'update')
  @ApiOperation({
    summary: 'Update several vendors at once',
    description:
      'Applies per-vendor changes to criticality, PCI DSS scope flags, contract and assurance fields and the owner in one transaction. Use to classify vendors in bulk or import TPSP data from a spreadsheet.',
  })
  @ApiBody({ type: BulkUpdateVendorsDto })
  async bulkUpdateVendors(
    @Body() body: BulkUpdateVendorsDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.register.bulkUpdate({
      organizationId,
      updates: body.updates,
      actorUserId: authContext.userId,
    });
    return { ...result, ...authMeta(authContext) };
  }

  @Post(':id/archive')
  @RequirePermission('vendor', 'update')
  @ApiOperation({
    summary: 'Archive a vendor',
    description:
      'Marks the vendor relationship as ended. Archived vendors leave the current vendor register, reminders and the trust portal subprocessor list; their reviews and documents are kept.',
  })
  @ApiParam(VENDOR_ID)
  @ApiBody({ type: ArchiveVendorDto })
  async archiveVendor(
    @Param('id') vendorId: string,
    @Body() body: ArchiveVendorDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const vendor = await this.register.archive({
      vendorId,
      organizationId,
      reason: body.reason,
    });
    return { ...vendor, ...authMeta(authContext) };
  }

  @Post(':id/unarchive')
  @RequirePermission('vendor', 'update')
  @ApiOperation({
    summary: 'Restore an archived vendor',
    description: 'Moves an archived vendor back into the current register.',
  })
  @ApiParam(VENDOR_ID)
  async unarchiveVendor(
    @Param('id') vendorId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const vendor = await this.register.unarchive({ vendorId, organizationId });
    return { ...vendor, ...authMeta(authContext) };
  }
}
