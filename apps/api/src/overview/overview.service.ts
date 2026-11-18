import { Injectable } from '@nestjs/common';
import { loadComplianceTrends } from './compliance-snapshots';
import { loadIntegrationCoverage } from './integration-coverage';
import { buildAttentionCards } from './overview-attention';
import { loadOverviewData } from './overview-data';
import {
  buildDeadlines,
  DEFAULT_DEADLINE_WINDOW_DAYS,
} from './overview-deadlines';

@Injectable()
export class OverviewService {
  async getAttention(organizationId: string) {
    const data = await loadOverviewData({ organizationId });
    return {
      data: buildAttentionCards({ data }),
      computedAt: new Date().toISOString(),
    };
  }

  async getDeadlines({
    organizationId,
    days,
  }: {
    organizationId: string;
    days?: number;
  }) {
    const data = await loadOverviewData({ organizationId });
    return buildDeadlines({
      data,
      windowDays: days ?? DEFAULT_DEADLINE_WINDOW_DAYS,
    });
  }

  getTrends({
    organizationId,
    days,
  }: {
    organizationId: string;
    days?: number;
  }) {
    return loadComplianceTrends({ organizationId, days: days ?? 90 });
  }

  async getIntegrationCoverage(organizationId: string) {
    const data = await loadIntegrationCoverage({ organizationId });
    return { data, count: data.length };
  }
}
