import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditRead } from '../../../audit/skip-audit-log.decorator';
import { OrganizationId } from '../../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../../auth/permission.guard';
import { RequirePermission } from '../../../auth/require-permission.decorator';
import { datedFileName, REGISTERS, type RegisterKey } from './registers';

/**
 * CSV snapshots of the platform registers an auditor samples from. Each
 * endpoint needs read on the register's own resource.
 */
@ApiTags('Evidence Export')
@Controller({ path: 'register-exports', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class RegisterExportsController {
  private async send({
    key,
    organizationId,
    res,
  }: {
    key: RegisterKey;
    organizationId: string;
    res: Response;
  }): Promise<void> {
    const csv = await REGISTERS[key].build({ organizationId });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${datedFileName(key)}"`,
    );
    res.send(csv);
  }

  @Get('risks')
  @RequirePermission('risk', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export the risk register as CSV',
    description:
      'Download every risk with owner, inherent and residual rating, treatment and latest acceptance as CSV. Use as ISO 27001 6.1 / PCI DSS 12.3.1 audit evidence.',
  })
  @ApiResponse({ status: 200, description: 'Risk register CSV' })
  async exportRisks(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'risks', organizationId, res });
  }

  @Get('risk-acceptances')
  @RequirePermission('risk', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export risk acceptances as CSV',
    description:
      'Download every residual-risk acceptance for risks and vendors (who, when, rating, notes, still current) as CSV. Evidence for ISO 27001 clause 6.1.3 f.',
  })
  @ApiResponse({ status: 200, description: 'Risk acceptances CSV' })
  async exportRiskAcceptances(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'risk-acceptances', organizationId, res });
  }

  @Get('vendors')
  @RequirePermission('vendor', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export the vendor register as CSV',
    description:
      'Download every vendor with category, assessment status, owner, risk ratings, treatment and acceptance as CSV. Evidence for ISO 27001 A.5.19-A.5.22 and PCI DSS 12.8.',
  })
  @ApiResponse({ status: 200, description: 'Vendor register CSV' })
  async exportVendors(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'vendors', organizationId, res });
  }

  @Get('people')
  @RequirePermission('member', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export the people population as CSV',
    description:
      'Download every member with role, department, join and leave dates, policy sign-off, training, background check and device compliance as CSV, for audit sampling.',
  })
  @ApiResponse({ status: 200, description: 'People population CSV' })
  async exportPeople(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'people', organizationId, res });
  }

  @Get('devices')
  @RequirePermission('member', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export the device inventory as CSV',
    description:
      'Download every enrolled device with owner, OS, encryption, antivirus, password policy, screen lock and last check-in as CSV. Evidence for asset inventory and endpoint controls.',
  })
  @ApiResponse({ status: 200, description: 'Device inventory CSV' })
  async exportDevices(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'devices', organizationId, res });
  }

  @Get('offboarding')
  @RequirePermission('member', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export offboarding records as CSV',
    description:
      'Download one row per offboarded person with leave date, checklist completion and vendor access revoked as CSV. Evidence for ISO 27001 A.5.11, A.5.18 and A.6.5.',
  })
  @ApiResponse({ status: 200, description: 'Offboarding records CSV' })
  async exportOffboarding(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'offboarding', organizationId, res });
  }

  @Get('findings')
  @RequirePermission('finding', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export audit findings as CSV',
    description:
      'Download every audit finding with framework, severity, status, subject and who raised it as CSV. Evidence of nonconformity tracking for ISO 27001 clause 10.2.',
  })
  @ApiResponse({ status: 200, description: 'Findings CSV' })
  async exportFindings(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'findings', organizationId, res });
  }

  @Get('assets')
  @RequirePermission('integration', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export the asset inventory as CSV',
    description:
      'Download every active asset with type, source, environment, PCI CDE scope, classification, owner and open vulnerabilities as CSV. Evidence for ISO 27001 A.5.9 and PCI DSS 12.5.1.',
  })
  @ApiResponse({ status: 200, description: 'Asset inventory CSV' })
  async exportAssets(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'assets', organizationId, res });
  }

  @Get('vulnerabilities')
  @RequirePermission('integration', 'read')
  @AuditRead()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export vulnerabilities as CSV',
    description:
      'Download every vulnerability with severity, source, asset, owner, first seen, SLA due date and SLA status as CSV. Evidence for ISO 27001 A.8.8 and PCI DSS 6.3.3 / 11.3.',
  })
  @ApiResponse({ status: 200, description: 'Vulnerabilities CSV' })
  async exportVulnerabilities(
    @OrganizationId() organizationId: string,
    @Res() res: Response,
  ) {
    await this.send({ key: 'vulnerabilities', organizationId, res });
  }
}
