import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ControlsController } from './controls.controller';
import { ControlsMappingController } from './controls-mapping.controller';
import { ControlsBulkOwnerService } from './controls-bulk-owner.service';
import { ControlsOverviewService } from './controls-overview.service';
import { RelatedControlsService } from './related-controls.service';
import { ControlsService } from './controls.service';

@Module({
  imports: [AuthModule],
  // ControlsMappingController first: its static paths must win over ':id'.
  controllers: [ControlsMappingController, ControlsController],
  providers: [
    ControlsService,
    ControlsOverviewService,
    RelatedControlsService,
    ControlsBulkOwnerService,
  ],
  exports: [ControlsService],
})
export class ControlsModule {}
