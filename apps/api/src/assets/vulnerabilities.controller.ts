import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { authMeta } from '../vendors/tpsp/auth-meta';
import {
  CreateVulnerabilityDto,
  ImportVulnerabilitiesDto,
  UpdateVulnerabilityDto,
} from './dto/vulnerability.dto';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityImportService } from './vulnerability-import.service';

/** Vulnerability store with remediation SLAs (ISO 27001 A.8.8; PCI DSS 6.3.1, 6.3.3, 11.3). */
@ApiTags('Vulnerabilities')
@Controller({ path: 'vulnerabilities', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class VulnerabilitiesController {
  constructor(
    private readonly vulnerabilities: VulnerabilitiesService,
    private readonly importer: VulnerabilityImportService,
  ) {}

  @Get()
  @RequirePermission('integration', 'read')
  @ApiOperation({
    summary: 'List vulnerabilities',
    description:
      'Returns vulnerabilities from integrations, ASV scans, pentests and manual entry with severity, first seen, SLA due date and status (overdue, due soon), owner and affected asset.',
  })
  async listVulnerabilities(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const data = await this.vulnerabilities.list(organizationId);
    return { data, count: data.length, ...authMeta(authContext) };
  }

  @Post()
  @RequirePermission('integration', 'create')
  @ApiOperation({
    summary: 'Log a vulnerability',
    description:
      'Records a vulnerability found outside the integrations (manual test, bug bounty, vendor advisory). The remediation SLA due date is set from severity and first-seen date.',
  })
  @ApiBody({ type: CreateVulnerabilityDto })
  async createVulnerability(
    @Body() dto: CreateVulnerabilityDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const row = await this.vulnerabilities.create({
      organizationId,
      dto,
      actor: authContext,
    });
    return { ...row, ...authMeta(authContext) };
  }

  @Post('import')
  @RequirePermission('integration', 'create')
  @ApiOperation({
    summary: 'Import a scan or pentest from CSV',
    description:
      'Imports an ASV scan (PCI DSS 11.3.2), internal scan (11.3.1) or penetration test (11.4) CSV export and records the scan with its date, vendor, verdict and optional report. Rows link to assets by IP, DNS name or host (unknown hosts are added to the inventory) and dedupe per host and CVE or title; a rescan updates them and can resolve findings no longer listed. ASV rows at CVSS 4.0 or above are flagged as ASV failures, due before the next quarterly scan.',
  })
  @ApiBody({ type: ImportVulnerabilitiesDto })
  async importVulnerabilities(
    @Body() dto: ImportVulnerabilitiesDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const result = await this.importer.import({
      organizationId,
      source: dto.source,
      csv: dto.csv,
      resolveMissing: dto.resolveMissing ?? false,
      scannedAt: dto.scannedAt
        ? new Date(`${dto.scannedAt}T00:00:00Z`)
        : new Date(),
      vendor: dto.vendor,
      passed: dto.passed,
      report: dto.report,
      userId: authContext.userId,
    });
    return { ...result, ...authMeta(authContext) };
  }

  @Patch(':id')
  @RequirePermission('integration', 'update')
  @ApiOperation({
    summary: 'Update a vulnerability',
    description:
      'Assigns a remediation owner or asset, or changes status: resolve a manual or imported finding, mark a false positive (with a note and optional evidence file), or accept the risk until a date with another member as approver (not allowed for critical/high findings on in-scope or connected assets).',
  })
  @ApiParam({
    name: 'id',
    description: 'Vulnerability ID',
    example: 'ipf_abc123',
  })
  @ApiBody({ type: UpdateVulnerabilityDto })
  async updateVulnerability(
    @Param('id') vulnerabilityId: string,
    @Body() dto: UpdateVulnerabilityDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    const row = await this.vulnerabilities.update({
      organizationId,
      vulnerabilityId,
      dto,
      actor: authContext,
    });
    return { ...row, ...authMeta(authContext) };
  }
}
