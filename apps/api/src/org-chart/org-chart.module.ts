import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgChartController } from './org-chart.controller';
import { OrgChartService } from './org-chart.service';
import { OrgChartSnapshotsController } from './org-chart-snapshots.controller';
import { OrgChartSnapshotsService } from './org-chart-snapshots.service';

@Module({
  imports: [AuthModule],
  controllers: [OrgChartSnapshotsController, OrgChartController],
  providers: [OrgChartService, OrgChartSnapshotsService],
  exports: [OrgChartService],
})
export class OrgChartModule {}
