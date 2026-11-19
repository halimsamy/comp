import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../../attachments/attachments.module';
import { AuthModule } from '../../auth/auth.module';
import { NativeEvidenceController } from './native-evidence.controller';
import { NativeEvidenceService } from './native-evidence.service';
import { NovuService } from '../../notifications/novu.service';
import { TaskNotifierService } from '../task-notifier.service';

@Module({
  imports: [AuthModule, AttachmentsModule],
  controllers: [NativeEvidenceController],
  providers: [NativeEvidenceService, TaskNotifierService, NovuService],
})
export class NativeEvidenceModule {}
