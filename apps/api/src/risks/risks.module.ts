import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RiskAcceptancesController } from './risk-acceptances.controller';
import { RiskAcceptancesService } from './risk-acceptances.service';
import { RiskReviewsService } from './risk-reviews.service';
import { RiskSuggestionsService } from './risk-suggestions.service';
import { RiskWorkspaceController } from './risk-workspace.controller';
import { RiskWorkspaceService } from './risk-workspace.service';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';

@Module({
  imports: [AuthModule],
  controllers: [RisksController, RiskAcceptancesController, RiskWorkspaceController],
  providers: [
    RisksService,
    RiskAcceptancesService,
    RiskWorkspaceService,
    RiskReviewsService,
    RiskSuggestionsService,
  ],
  exports: [RisksService, RiskAcceptancesService],
})
export class RisksModule {}
