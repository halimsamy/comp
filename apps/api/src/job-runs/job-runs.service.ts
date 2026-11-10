import { db } from '@db';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/types';
import { canReadJobRun } from './job-run-access';

const JOB_RUN_SELECT = {
  id: true,
  taskId: true,
  status: true,
  output: true,
  error: true,
  metadata: true,
  tags: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
} as const;

@Injectable()
export class JobRunsService {
  /**
   * Scoped by organization in the query itself: runs from another org — and
   * runs with no organizationId (system/cron runs) — are indistinguishable from
   * missing ones. The task must also be listed in JOB_RUN_READ_RESOURCES and
   * the caller must hold `read` on each of its resources.
   */
  async findOne(params: { runId: string; request: AuthenticatedRequest }) {
    const { request } = params;
    const run = await db.jobRun.findFirst({
      where: { id: params.runId, organizationId: request.organizationId },
      select: JOB_RUN_SELECT,
    });
    if (!run) throw new NotFoundException('Run not found');
    if (!(await canReadJobRun({ request, taskId: run.taskId }))) {
      throw new NotFoundException('Run not found');
    }
    return run;
  }
}
