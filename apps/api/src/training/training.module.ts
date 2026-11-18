import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';
import { TrainingEmailService } from './training-email.service';
import { TrainingCertificatePdfService } from './training-certificate-pdf.service';
import { TrainingModulesController } from './training-modules.controller';
import { TrainingModulesService } from './training-modules.service';
import { TrainingHistoryService } from './training-history.service';

@Module({
  imports: [AuthModule],
  controllers: [TrainingController, TrainingModulesController],
  providers: [
    TrainingService,
    TrainingEmailService,
    TrainingCertificatePdfService,
    TrainingModulesService,
    TrainingHistoryService,
  ],
  exports: [
    TrainingService,
    TrainingEmailService,
    TrainingCertificatePdfService,
    TrainingModulesService,
  ],
})
export class TrainingModule {}
