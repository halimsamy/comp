import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  CreateVendorDocumentDto,
  UpdateVendorDocumentDto,
} from './dto/vendor-document.dto';
import { authMeta } from './tpsp/auth-meta';
import { VendorDocumentsService } from './vendor-documents.service';

const VENDOR_ID = {
  name: 'id',
  description: 'Vendor ID',
  example: 'vnd_abc123',
};
const DOCUMENT_ID = {
  name: 'documentId',
  description: 'Vendor document ID',
  example: 'vdoc_abc123',
};

/**
 * Typed vendor documents (SOC 2, ISO certificate, AOC, DPA, contract) with
 * expiry tracking and AI summaries. ISO 27001 A.5.19-A.5.22, PCI DSS 12.8.
 */
@ApiTags('Vendors')
@Controller({ path: 'vendors', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class VendorDocumentsController {
  constructor(
    private readonly documents: VendorDocumentsService,
    private readonly actingUser: ActingUserResolver,
  ) {}

  @Get(':id/documents')
  @RequirePermission('vendor', 'read')
  @ApiOperation({
    summary: 'List vendor documents',
    description:
      'Returns the SOC 2 reports, ISO certificates, PCI DSS AOCs, DPAs and contracts on file for a vendor, with coverage period, expiry and AI summary.',
  })
  @ApiParam(VENDOR_ID)
  async listVendorDocuments(
    @Param('id') vendorId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const data = await this.documents.list({ vendorId, organizationId });
    return { data, count: data.length, ...authMeta(authContext) };
  }

  @Post(':id/documents')
  @RequirePermission('vendor', 'update')
  @ApiOperation({
    summary: 'Upload a vendor document',
    description:
      'Uploads a typed vendor document (SOC 2, ISO certificate, AOC, DPA, contract). Assurance reports are summarized by AI in the background; poll the document list for aiSummaryStatus.',
  })
  @ApiParam(VENDOR_ID)
  @ApiBody({ type: CreateVendorDocumentDto })
  async uploadVendorDocument(
    @Param('id') vendorId: string,
    @Body() dto: CreateVendorDocumentDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Req() req: AuthenticatedRequest,
  ) {
    const acting = await this.actingUser.resolve(req, organizationId);
    const document = await this.documents.create({
      vendorId,
      organizationId,
      dto,
      userId: acting.userId ?? undefined,
    });
    return { ...document, ...authMeta(authContext) };
  }

  @Patch(':id/documents/:documentId')
  @RequirePermission('vendor', 'update')
  @ApiOperation({
    summary: 'Update a vendor document',
    description:
      'Changes the type, name, coverage period or expiry of a vendor document. The vendor assurance fields follow the newest assurance report.',
  })
  @ApiParam(VENDOR_ID)
  @ApiParam(DOCUMENT_ID)
  @ApiBody({ type: UpdateVendorDocumentDto })
  async updateVendorDocument(
    @Param('id') vendorId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateVendorDocumentDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const document = await this.documents.update({
      vendorId,
      documentId,
      organizationId,
      dto,
    });
    return { ...document, ...authMeta(authContext) };
  }

  @Delete(':id/documents/:documentId')
  @RequirePermission('vendor', 'update')
  @ApiOperation({
    summary: 'Delete a vendor document',
    description: 'Deletes a vendor document and its stored file.',
  })
  @ApiParam(VENDOR_ID)
  @ApiParam(DOCUMENT_ID)
  async deleteVendorDocument(
    @Param('id') vendorId: string,
    @Param('documentId') documentId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.documents.remove({
      vendorId,
      documentId,
      organizationId,
    });
    return { ...result, ...authMeta(authContext) };
  }

  @Get(':id/documents/:documentId/download')
  @RequirePermission('vendor', 'read')
  @ApiOperation({
    summary: 'Get a vendor document download URL',
    description:
      'Returns a short-lived signed URL to download a vendor document such as a SOC 2 report or PCI DSS AOC.',
  })
  @ApiParam(VENDOR_ID)
  @ApiParam(DOCUMENT_ID)
  async getVendorDocumentDownloadUrl(
    @Param('id') vendorId: string,
    @Param('documentId') documentId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.documents.getDownloadUrl({
      vendorId,
      documentId,
      organizationId,
    });
    return { ...result, ...authMeta(authContext) };
  }

  @Post(':id/documents/:documentId/summarize')
  @RequirePermission('vendor', 'update')
  @ApiOperation({
    summary: 'Summarize a vendor document with AI',
    description:
      'Starts an AI summary of a SOC 2 report, ISO certificate, AOC or pentest report: opinion, exceptions, CUECs, scope and dates. Poll the document list until aiSummaryStatus is completed.',
  })
  @ApiParam(VENDOR_ID)
  @ApiParam(DOCUMENT_ID)
  async summarizeVendorDocument(
    @Param('id') vendorId: string,
    @Param('documentId') documentId: string,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const document = await this.documents.summarize({
      vendorId,
      documentId,
      organizationId,
    });
    return { ...document, ...authMeta(authContext) };
  }
}
