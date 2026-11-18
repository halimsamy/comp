import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { RisksModule } from '../risks/risks.module';
import { InternalVendorAutomationController } from './internal-vendor-automation.controller';
import { VendorAcceptancesController } from './vendor-acceptances.controller';
import { VendorDocumentsController } from './vendor-documents.controller';
import { VendorDocumentsService } from './vendor-documents.service';
import { VendorReviewsController } from './vendor-reviews.controller';
import { VendorReviewsService } from './vendor-reviews.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuthModule, RisksModule, AttachmentsModule],
  controllers: [
    VendorsController,
    VendorAcceptancesController,
    VendorDocumentsController,
    VendorReviewsController,
    InternalVendorAutomationController,
  ],
  providers: [VendorsService, VendorDocumentsService, VendorReviewsService],
  exports: [VendorsService],
})
export class VendorsModule {}
