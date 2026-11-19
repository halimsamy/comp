import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  EmailPreferencesByTokenController,
  MyEmailPreferencesController,
} from './email-preferences.controller';
import { EmailPreferencesService } from './email-preferences.service';
import { OwnershipNotifier } from './ownership-notifier.service';

/** Email preference updates and the shared ownership-assignment notifier. */
@Module({
  imports: [AuthModule],
  controllers: [
    MyEmailPreferencesController,
    EmailPreferencesByTokenController,
  ],
  providers: [EmailPreferencesService, OwnershipNotifier],
  exports: [OwnershipNotifier, EmailPreferencesService],
})
export class NotificationsModule {}
