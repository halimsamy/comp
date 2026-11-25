import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FleetService } from '../lib/fleet.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { ManualDevicesController } from './manual-devices.controller';

@Module({
  imports: [AuthModule],
  controllers: [DevicesController, ManualDevicesController],
  providers: [DevicesService, FleetService],
  exports: [DevicesService, FleetService],
})
export class DevicesModule {}
