import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExtension, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../../auth/types';
import { NativeEvidenceService } from './native-evidence.service';

@ApiTags('Tasks')
@Controller({ path: 'tasks', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class NativeEvidenceController {
  constructor(private readonly nativeEvidence: NativeEvidenceService) {}

  @Get(':taskId/native-evidence')
  @RequirePermission('task', 'read')
  @ApiExtension('x-speakeasy-mcp', { name: 'get-task-auto-evidence' })
  @ApiOperation({
    summary: 'Get task auto-evidence status',
    description:
      'Checks live whether records in ISMS, People, Access reviews or Vendors satisfy this task, and what is missing. Returns data null when the task has no rule.',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  async getStatus(@OrganizationId() organizationId: string, @Param('taskId') taskId: string) {
    return this.nativeEvidence.getStatus({ organizationId, taskId });
  }

  @Post(':taskId/native-evidence/submit')
  @HttpCode(200)
  @RequirePermission('task', 'update')
  @ApiExtension('x-speakeasy-mcp', { name: 'submit-task-auto-evidence' })
  @ApiOperation({
    summary: 'Attach auto-evidence and send for review',
    description:
      'When the task’s native-state rule is met, attaches a dated snapshot PDF and moves the task to in review for a person to sign off. Never marks it done.',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID' })
  async submit(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
  ) {
    return this.nativeEvidence.submit({
      organizationId,
      taskId,
      userId: authContext.userId,
      force: true,
    });
  }
}
