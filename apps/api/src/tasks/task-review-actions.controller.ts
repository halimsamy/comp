import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiExtension, ApiOperation, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { BulkTaskDueDateDto, TaskAttachmentsValidityDto } from './dto/task-review-actions.dto';
import { listTaskForms } from './task-forms';
import { setTaskAttachmentsValidity, setTaskDueDates, withdrawReviewRequest } from './task-review-actions';

@ApiTags('Tasks')
@Controller({ path: 'tasks', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class TaskReviewActionsController {
  @Patch('bulk/due-date')
  @RequirePermission('task', 'update')
  @ApiExtension('x-speakeasy-mcp', { name: 'set-tasks-due-date' })
  @ApiOperation({
    summary: 'Set the due date of several tasks',
    description:
      'Sets (or clears, with null) the due date of the given evidence tasks. Overdue and due-soon views and the deadline queue read this date.',
  })
  @ApiBody({ type: BulkTaskDueDateDto })
  async setDueDates(@OrganizationId() organizationId: string, @Body() body: BulkTaskDueDateDto) {
    return setTaskDueDates({ organizationId, taskIds: body.taskIds, dueDate: body.dueDate });
  }

  @Post(':taskId/withdraw-review')
  @HttpCode(200)
  @RequirePermission('task', 'update')
  @ApiExtension('x-speakeasy-mcp', { name: 'withdraw-task-review-request' })
  @ApiOperation({
    summary: 'Withdraw a task review request',
    description:
      'Withdraws an open review request: the task returns to its previous status and keeps its approver. Logged as a withdrawal, not a rejection.',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'tsk_abc123def456' })
  async withdrawReview(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
    @Param('taskId') taskId: string,
  ) {
    if (!authContext.userId) {
      throw new BadRequestException('This operation requires a signed-in user.');
    }
    return withdrawReviewRequest({ organizationId, taskId, userId: authContext.userId });
  }

  @Get(':taskId/forms')
  @RequirePermission('task', 'read')
  @ApiExtension('x-speakeasy-mcp', { name: 'list-task-structured-forms' })
  @ApiOperation({
    summary: 'List the company forms that prove a task',
    description:
      'The company forms (structured evidence) that the task’s controls ask for, with their due status. Forms replaced by a module name that module.',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'tsk_abc123def456' })
  async listForms(@OrganizationId() organizationId: string, @Param('taskId') taskId: string) {
    return { data: await listTaskForms({ organizationId, taskId }) };
  }

  @Patch(':taskId/attachments/validity')
  @RequirePermission('evidence', 'update')
  @ApiExtension('x-speakeasy-mcp', { name: 'set-task-files-validity' })
  @ApiOperation({
    summary: 'Set validity for all files on a task',
    description:
      'Sets the validity window of every evidence file on a task. After validUntil a file needs an update, and audit exports only take files valid in the period.',
  })
  @ApiParam({ name: 'taskId', description: 'Task ID', example: 'tsk_abc123def456' })
  @ApiBody({ type: TaskAttachmentsValidityDto })
  async setAttachmentsValidity(
    @OrganizationId() organizationId: string,
    @Param('taskId') taskId: string,
    @Body() body: TaskAttachmentsValidityDto,
  ) {
    return setTaskAttachmentsValidity({
      organizationId,
      taskId,
      validFrom: body.validFrom,
      validUntil: body.validUntil,
    });
  }
}
