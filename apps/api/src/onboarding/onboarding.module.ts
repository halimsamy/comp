import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OnboardingChecklistController } from './onboarding-checklist.controller';
import { OnboardingChecklistService } from './onboarding-checklist.service';

@Module({
  imports: [AuthModule],
  controllers: [OnboardingChecklistController],
  providers: [OnboardingChecklistService],
})
export class OnboardingModule {}
