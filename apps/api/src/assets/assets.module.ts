import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { IntegrationPlatformModule } from '../integration-platform/integration-platform.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssetSyncService } from './asset-sync.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityImportService } from './vulnerability-import.service';
import { VulnerabilityProgramController } from './vulnerability-program.controller';
import { VulnerabilityProgramService } from './vulnerability-program.service';
import { AssetImportService } from './asset-import.service';

@Module({
  imports: [
    AuthModule,
    IntegrationPlatformModule,
    AttachmentsModule,
    NotificationsModule,
  ],
  controllers: [
    AssetsController,
    VulnerabilitiesController,
    VulnerabilityProgramController,
  ],
  providers: [
    AssetsService,
    AssetSyncService,
    VulnerabilitiesService,
    VulnerabilityImportService,
    VulnerabilityProgramService,
    AssetImportService,
  ],
  exports: [AssetSyncService],
})
export class AssetsModule {}
