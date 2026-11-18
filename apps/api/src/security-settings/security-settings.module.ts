import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SecuritySettingsController } from './security-settings.controller';
import { SecuritySettingsService } from './security-settings.service';

@Module({
  imports: [AuthModule],
  controllers: [SecuritySettingsController],
  providers: [SecuritySettingsService],
})
export class SecuritySettingsModule {}
