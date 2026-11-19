import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditRequestsController } from './audit-requests.controller';
import { AuditRequestsService } from './audit-requests.service';
import { AuditTeamRequestsService } from './audit-team-requests.service';
import { AuditWorkspaceController } from './audit-workspace.controller';
import { AuditWorkspaceService } from './audit-workspace.service';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';

@Module({
  imports: [AuthModule, AttachmentsModule, NotificationsModule],
  controllers: [AuditsController, AuditWorkspaceController, AuditRequestsController],
  providers: [
    AuditsService,
    AuditWorkspaceService,
    AuditRequestsService,
    AuditTeamRequestsService,
  ],
})
export class AuditsModule {}
