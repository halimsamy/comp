import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimelinesModule } from '../timelines/timelines.module';
import { FrameworksController } from './frameworks.controller';
import { FrameworksService } from './frameworks.service';
import { FrameworkSyncService } from './framework-versioning/framework-sync.service';
import { FrameworkRollbackService } from './framework-versioning/framework-rollback.service';
import { RequirementApplicabilityController } from './applicability/requirement-applicability.controller';
import { RequirementApplicabilityService } from './applicability/requirement-applicability.service';

@Module({
  imports: [AuthModule, TimelinesModule],
  controllers: [FrameworksController, RequirementApplicabilityController],
  providers: [
    FrameworksService,
    FrameworkSyncService,
    FrameworkRollbackService,
    RequirementApplicabilityService,
  ],
  exports: [FrameworksService],
})
export class FrameworksModule {}
