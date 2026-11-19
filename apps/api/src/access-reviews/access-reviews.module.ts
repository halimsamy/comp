import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrationPlatformModule } from '../integration-platform/integration-platform.module';
import { AccessAccountsController } from './access-accounts.controller';
import { AccessAccountsService } from './access-accounts.service';
import { AccessReviewEvidenceService } from './access-review-evidence.service';
import { AccessReviewsController } from './access-reviews.controller';
import { AccessReviewsService } from './access-reviews.service';
import { AccessRolesController } from './access-roles.controller';
import { AccessRolesService } from './access-roles.service';
import { AccessSystemsService } from './access-systems.service';

@Module({
  imports: [AuthModule, AttachmentsModule, IntegrationPlatformModule],
  controllers: [
    AccessAccountsController,
    AccessReviewsController,
    AccessRolesController,
  ],
  providers: [
    AccessAccountsService,
    AccessSystemsService,
    AccessReviewsService,
    AccessReviewEvidenceService,
    AccessRolesService,
  ],
  exports: [AccessAccountsService],
})
export class AccessReviewsModule {}
