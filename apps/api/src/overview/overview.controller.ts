import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { DeadlinesQueryDto, TrendsQueryDto } from './dto/overview-query.dto';
import { OverviewService } from './overview.service';

@ApiTags('Overview')
@Controller({ path: 'overview', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get('attention')
  @RequirePermission('app', 'read')
  @ApiOperation({
    summary: 'Get needs-attention cards',
    description:
      'Returns one card per compliance area (evidence tasks, policies, acknowledgements, training, people, vendors, risks, assets, vulnerabilities, integration checks, corrective actions, documents (ISMS documents and company forms), questionnaire reviews, access reviews) with needs-attention, OK and total counts, reasons (some with a filtered deep link) and a deep link.',
  })
  async getAttention(@OrganizationId() organizationId: string) {
    return this.overviewService.getAttention(organizationId);
  }

  @Get('deadlines')
  @RequirePermission('app', 'read')
  @ApiOperation({
    summary: 'Get overdue and due-soon items',
    description:
      'Returns one queue of overdue and due-soon items across evidence tasks, policy reviews and approvals, vendor reviews and documents, training renewals, access reviews, timeline phases, auditor requests, questionnaire reviews, vulnerability SLAs, corrective and management-review actions, risk treatment actions, the risk register review, the scan cadence and company form due dates, sorted by due date, with deep links. Open items without a due date are listed separately.',
  })
  async getDeadlines(
    @OrganizationId() organizationId: string,
    @Query() query: DeadlinesQueryDto,
  ) {
    return this.overviewService.getDeadlines({
      organizationId,
      days: query.days,
    });
  }

  @Get('trends')
  @RequirePermission('app', 'read')
  @ApiOperation({
    summary: 'Get compliance score history',
    description:
      'Returns the daily compliance score history of each framework (from the daily snapshot job) over the last 30, 90, 180 or 365 days, for trend charts and period reporting.',
  })
  async getTrends(
    @OrganizationId() organizationId: string,
    @Query() query: TrendsQueryDto,
  ) {
    return this.overviewService.getTrends({ organizationId, days: query.days });
  }

  @Get('integration-coverage')
  @RequirePermission('integration', 'read')
  @ApiOperation({
    summary: 'Get evidence coverage per integration',
    description:
      'For each integration, returns how many of the organization’s evidence tasks its checks collect and how many framework requirements (e.g. ISO 27001, PCI DSS) those tasks evidence.',
  })
  async getIntegrationCoverage(@OrganizationId() organizationId: string) {
    return this.overviewService.getIntegrationCoverage(organizationId);
  }
}
