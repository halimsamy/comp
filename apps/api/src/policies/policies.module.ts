import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { TimelinesModule } from '../timelines/timelines.module';
import { PolicyPdfRendererService } from '../trust-portal/policy-pdf-renderer.service';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';
import { PolicyAcknowledgementsController } from './lifecycle/policy-acknowledgements.controller';
import { PolicyAcknowledgementsService } from './lifecycle/policy-acknowledgements.service';
import { PolicyDocumentControlService } from './lifecycle/policy-document-control.service';
import { PolicyLifecycleController } from './lifecycle/policy-lifecycle.controller';
import { PolicyReviewsService } from './lifecycle/policy-reviews.service';

@Module({
  imports: [AuthModule, AttachmentsModule, TimelinesModule],
  controllers: [
    PoliciesController,
    PolicyLifecycleController,
    PolicyAcknowledgementsController,
  ],
  providers: [
    PoliciesService,
    PolicyPdfRendererService,
    PolicyReviewsService,
    PolicyAcknowledgementsService,
    PolicyDocumentControlService,
  ],
  exports: [PoliciesService],
})
export class PoliciesModule {}
