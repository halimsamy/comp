import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationPlatformModule } from '../integration-platform/integration-platform.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { TimelinesModule } from '../timelines/timelines.module';
import { FleetService } from '../lib/fleet.service';
import { PeopleBackgroundCheckController } from './people-background-check.controller';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { PeopleInviteService } from './people-invite.service';

@Module({
  imports: [AuthModule, AttachmentsModule, TimelinesModule, IntegrationPlatformModule],
  controllers: [PeopleController, PeopleBackgroundCheckController],
  providers: [PeopleService, PeopleInviteService, FleetService],
  exports: [PeopleService],
})
export class PeopleModule {}
