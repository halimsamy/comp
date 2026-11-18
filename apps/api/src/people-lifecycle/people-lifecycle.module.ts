import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OffboardingChecklistModule } from '../offboarding-checklist/offboarding-checklist.module';
import { TrainingModule } from '../training/training.module';
import { MemberComplianceService } from './member-compliance.service';
import { PeopleLifecycleController } from './people-lifecycle.controller';

@Module({
  imports: [AuthModule, OffboardingChecklistModule, TrainingModule],
  controllers: [PeopleLifecycleController],
  providers: [MemberComplianceService],
})
export class PeopleLifecycleModule {}
