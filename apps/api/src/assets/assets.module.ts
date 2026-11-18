import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationPlatformModule } from '../integration-platform/integration-platform.module';
import { AssetSyncService } from './asset-sync.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';
import { VulnerabilityImportService } from './vulnerability-import.service';

@Module({
  imports: [AuthModule, IntegrationPlatformModule],
  controllers: [AssetsController, VulnerabilitiesController],
  providers: [
    AssetsService,
    AssetSyncService,
    VulnerabilitiesService,
    VulnerabilityImportService,
  ],
  exports: [AssetSyncService],
})
export class AssetsModule {}
