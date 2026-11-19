import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { TrainingRecordsController } from './training-records.controller';
import { TrainingRecordsService } from './training-records.service';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { TrainingEmailService } from './training-email.service';
import { TrainingCertificatePdfService } from './training-certificate-pdf.service';
import { TrainingModulesController } from './training-modules.controller';
import { TrainingModulesService } from './training-modules.service';
import { TrainingHistoryService } from './training-history.service';

@Module({
  imports: [AuthModule, AttachmentsModule],
  controllers: [TrainingController, TrainingModulesController, TrainingRecordsController],
  providers: [
    TrainingService,
    TrainingEmailService,
    TrainingCertificatePdfService,
    TrainingModulesService,
    TrainingHistoryService,
    TrainingRecordsService,
  ],
  exports: [
    TrainingService,
    TrainingEmailService,
    TrainingCertificatePdfService,
    TrainingModulesService,
  ],
})
export class TrainingModule {}
