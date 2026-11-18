import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExternalQuestionnaireReviewService } from './external-review.service';
import { QuestionnaireReviewController } from './questionnaire-review.controller';
import { QuestionnaireController } from './questionnaire.controller';
import { QuestionnaireService } from './questionnaire.service';
import { TrustPortalModule } from '../trust-portal/trust-portal.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [AuthModule, TrustPortalModule, UploadsModule],
  controllers: [QuestionnaireController, QuestionnaireReviewController],
  providers: [QuestionnaireService, ExternalQuestionnaireReviewService],
})
export class QuestionnaireModule {}
