import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBody,
  ApiHeader,
  ApiProduces,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { OrgChartService } from './org-chart.service';
import { UpsertOrgChartDto } from './dto/upsert-org-chart.dto';
import { UploadOrgChartDto } from './dto/upload-org-chart.dto';
import { ExportOrgChartPdfDto } from './dto/export-org-chart-pdf.dto';

@ApiTags('Org Chart')
@Controller({ path: 'org-chart', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
@ApiHeader({
  name: 'X-Organization-Id',
  description:
    'Organization ID (required for session auth, optional for API key auth)',
  required: false,
})
export class OrgChartController {
  constructor(private readonly orgChartService: OrgChartService) {}

  @Get()
  @RequirePermission('organization', 'read')
  @ApiOperation({ summary: 'Get the organization chart' })
  @ApiResponse({ status: 200, description: 'The organization chart' })
  async getOrgChart(@OrganizationId() organizationId: string) {
    return await this.orgChartService.findByOrganization(organizationId);
  }

  @Put()
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Create or update an interactive organization chart',
  })
  @ApiResponse({ status: 200, description: 'The saved organization chart' })
  @UsePipes(new ValidationPipe({ whitelist: false, transform: false }))
  async upsertOrgChart(
    @OrganizationId() organizationId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto: UpsertOrgChartDto = {
      name: typeof body?.name === 'string' ? body.name : undefined,
      nodes: Array.isArray(body?.nodes) ? body.nodes : [],
      edges: Array.isArray(body?.edges) ? body.edges : [],
    };
    return await this.orgChartService.upsertInteractive(organizationId, dto);
  }

  @Post('upload')
  @RequirePermission('organization', 'update')
  @ApiOperation({ summary: 'Upload an image as the organization chart' })
  @ApiResponse({ status: 201, description: 'The uploaded organization chart' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async uploadOrgChart(
    @OrganizationId() organizationId: string,
    @Body() dto: UploadOrgChartDto,
  ) {
    return await this.orgChartService.uploadImage(organizationId, dto);
  }

  @Post('pdf')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('organization', 'read')
  @ApiOperation({
    summary: 'Export the organization chart as a PDF',
    description:
      'Wraps a PNG rendering of the org chart in a branded PDF document with the chart name, as-of date and headcount. Used by the web app export button.',
  })
  @ApiBody({ type: ExportOrgChartPdfDto })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF file' })
  @ApiResponse({ status: 400, description: 'Image is not a PNG data URL' })
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async exportOrgChartPdf(
    @OrganizationId() organizationId: string,
    @Body() dto: ExportOrgChartPdfDto,
    @Res() res: Response,
  ): Promise<void> {
    const pdf = await this.orgChartService.renderPdf({ organizationId, dto });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  }

  @Delete()
  @RequirePermission('organization', 'delete')
  @ApiOperation({ summary: 'Delete the organization chart' })
  @ApiResponse({ status: 200, description: 'Deletion confirmation' })
  async deleteOrgChart(@OrganizationId() organizationId: string) {
    return await this.orgChartService.delete(organizationId);
  }
}
