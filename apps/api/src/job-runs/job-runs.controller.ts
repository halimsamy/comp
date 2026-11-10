import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../auth/types';
import { JobRunsService } from './job-runs.service';

/**
 * Background job run status for the app's progress UIs (replaces trigger.dev
 * realtime + public access tokens). Internal plumbing, so excluded from the
 * public OpenAPI/MCP surface.
 */
@ApiExcludeController()
// Progress UIs poll every 1-2s; a 429 must not make a still-running job look failed.
@SkipThrottle()
@Controller({ path: 'job-runs', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
export class JobRunsController {
  constructor(private readonly jobRunsService: JobRunsService) {}

  @Get(':runId')
  // app:read: run status/progress belongs to compliance-app features, and every
  // role that can see those screens has it. Org scoping and the per-task
  // resource read check (job-run-access.ts) are enforced in the service.
  @RequirePermission('app', 'read')
  @ApiOperation({
    summary: 'Get a background job run',
    description:
      'Returns status, output, error and progress metadata of a background job run in the active organization. Poll until status is terminal.',
  })
  @ApiParam({ name: 'runId', description: 'Job run id (jrun_...)' })
  @ApiResponse({ status: 200, description: 'The run' })
  @ApiResponse({ status: 404, description: 'Run not found in this organization' })
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('runId') runId: string,
  ) {
    return this.jobRunsService.findOne({ runId, request });
  }
}
