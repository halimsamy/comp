import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessReviewsModule } from '../access-reviews/access-reviews.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AccessRevocationController } from './access-revocation.controller';
import { AccessRevocationService } from './access-revocation.service';
import { OffboardingChecklistController } from './offboarding-checklist.controller';
import { OffboardingChecklistService } from './offboarding-checklist.service';
import { OffboardingExportService } from './offboarding-export.service';

@Module({
  imports: [AuthModule, AttachmentsModule, AccessReviewsModule],
  controllers: [OffboardingChecklistController, AccessRevocationController],
  providers: [
    OffboardingChecklistService,
    AccessRevocationService,
    OffboardingExportService,
  ],
  exports: [OffboardingChecklistService, AccessRevocationService],
})
export class OffboardingChecklistModule {}
