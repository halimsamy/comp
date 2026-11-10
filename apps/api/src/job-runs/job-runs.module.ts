import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobRunsController } from './job-runs.controller';
import { JobRunsService } from './job-runs.service';

@Module({
  imports: [AuthModule],
  controllers: [JobRunsController],
  providers: [JobRunsService],
})
export class JobRunsModule {}
