import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RisksModule } from '../risks/risks.module';
import { InternalVendorAutomationController } from './internal-vendor-automation.controller';
import { VendorAcceptancesController } from './vendor-acceptances.controller';
import { VendorDocumentsController } from './vendor-documents.controller';
import { VendorDocumentsService } from './vendor-documents.service';
import { VendorRegisterController } from './vendor-register.controller';
import { VendorRegisterService } from './vendor-register.service';
import { VendorReviewsController } from './vendor-reviews.controller';
import { VendorReviewsService } from './vendor-reviews.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuthModule, RisksModule, AttachmentsModule, NotificationsModule],
  controllers: [
    VendorsController,
    VendorAcceptancesController,
    VendorDocumentsController,
    VendorReviewsController,
    VendorRegisterController,
    InternalVendorAutomationController,
  ],
  providers: [
    VendorsService,
    VendorDocumentsService,
    VendorReviewsService,
    VendorRegisterService,
  ],
  exports: [VendorsService],
})
export class VendorsModule {}
