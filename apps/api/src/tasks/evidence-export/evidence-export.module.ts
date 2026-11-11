import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TasksModule } from '../tasks.module';
import { EvidenceExportService } from './evidence-export.service';
import {
  EvidenceExportController,
  AuditorEvidenceExportController,
} from './evidence-export.controller';
import { FrameworkEvidenceExportController } from './framework-evidence-export.controller';
import { FrameworkEvidenceExportService } from './framework-evidence-export.service';
import { PolicyPdfRendererService } from '../../trust-portal/policy-pdf-renderer.service';

@Module({
  imports: [AuthModule, forwardRef(() => TasksModule)],
  controllers: [
    EvidenceExportController,
    AuditorEvidenceExportController,
    FrameworkEvidenceExportController,
  ],
  providers: [
    EvidenceExportService,
    FrameworkEvidenceExportService,
    PolicyPdfRendererService,
  ],
  exports: [EvidenceExportService],
})
export class EvidenceExportModule {}
