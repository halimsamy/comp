'use client';

import { SelectAssignee } from '@/components/SelectAssignee';
import { RecentAuditLogs } from '@/components/RecentAuditLogs';
import { MarkdownRenderer } from '../automation/[automationId]/components/markdown-renderer/markdown-renderer';
import { useAuditLogs } from '@/hooks/use-audit-logs';
import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { downloadTaskEvidenceZip } from '@/lib/evidence-download';
import { usePermissions } from '@/hooks/use-permissions';
import { useActiveMember } from '@/utils/auth-client';
import { Button } from '@trycompai/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@trycompai/ui/dialog';
import {
  CommentEntityType,
  EvidenceAutomation,
  EvidenceAutomationRun,
  type Control,
  type Member,
  type Task,
  type TaskFrequency,
  type TaskStatus,
  type User,
} from '@db';
import {
  Breadcrumb,
  HStack,
  Label,
  PageLayout,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@trycompai/design-system';
import { Download, RefreshCw, SendHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Comments } from '../../../../../../components/comments/Comments';
import { useTask } from '../hooks/use-task';
import { useTaskAutomations } from '../hooks/use-task-automations';
import { BrowserAutomations } from './BrowserAutomations';
import { TaskAutomations } from './TaskAutomations';
import { TaskEvidenceSourceBadge } from './TaskEvidenceSourceBadge';
import { TaskDeleteDialog } from './TaskDeleteDialog';
import { TaskIntegrationChecks } from './TaskIntegrationChecks';
import { TaskMainContent } from './TaskMainContent';
import { TaskPolicies } from './TaskPolicies';
import { RelatedControls } from '@/components/related-controls/RelatedControls';
import { AutomationReviewBanner } from './AutomationReviewBanner';
import { TaskPropertiesSidebar } from './TaskPropertiesSidebar';
import { TaskNativeEvidence } from './TaskNativeEvidence';
import { ApprovalBanner, NotRelevantBanner } from './TaskReviewBanners';
import { TaskStructuredEvidence } from './TaskStructuredEvidence';
import { taskNativeEvidenceKey } from '../hooks/use-task-native-evidence';
import { useSWRConfig } from 'swr';

type AutomationWithRuns = EvidenceAutomation & {
  runs: EvidenceAutomationRun[];
};

interface SingleTaskProps {
  initialTask: Task & { fileUrls?: string[]; controls?: Control[] };
  initialMembers?: (Member & { user: User })[];
  initialAutomations: AutomationWithRuns[];
  isWebAutomationsEnabled: boolean;
  isPlatformAdmin: boolean;
  evidenceApprovalEnabled?: boolean;
}

export function SingleTask({
  initialTask,
  initialMembers,
  initialAutomations,
  isWebAutomationsEnabled,
  isPlatformAdmin,
  evidenceApprovalEnabled = false,
}: SingleTaskProps) {
  const params = useParams();
  const searchParams = useSearchParams();
  const orgId = params.orgId as string;
  const taskId = params.taskId as string;
  const defaultTab = searchParams.get('tab') || 'overview';

  const {
    task,
    isLoading,
    mutate: mutateTask,
    updateTask,
    regenerateTask,
    submitForReview,
    approveTask: approveTaskFn,
    rejectTask: rejectTaskFn,
    withdrawReview,
  } = useTask({
    initialData: initialTask,
  });
  const { automations } = useTaskAutomations({
    initialData: initialAutomations,
  });
  const { mutate: mutateActivity } = useAuditLogs({ entityType: 'task', entityId: taskId });
  const { mutate: globalMutate } = useSWRConfig();
  // A status change can make auto-evidence submittable (or not) again.
  const refreshAfterStatusChange = () => {
    mutateActivity();
    void globalMutate(taskNativeEvidenceKey(taskId));
  };

  const { data: activeMember } = useActiveMember();
  const { members } = useOrganizationMembers({
    initialData: initialMembers,
  });

  const { hasPermission } = usePermissions();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isRegenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [requestApprovalDialogOpen, setRequestApprovalDialogOpen] = useState(false);
  const [selectedApproverId, setSelectedApproverId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');

  if (!task || isLoading) {
    return null;
  }

  const canUpdateTask = hasPermission('task', 'update');
  const canDeleteTask = hasPermission('task', 'delete');
  const canReadPolicy = hasPermission('policy', 'read');
  const canReadControl = hasPermission('control', 'read');

  const startEditingTitle = () => {
    if (!canUpdateTask) return;
    setTitleValue(task.title);
    setIsEditingTitle(true);
  };

  const saveTitleEdit = async () => {
    if (!titleValue.trim() || titleValue === task.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await updateTask({ title: titleValue.trim() });
      toast.success('Title updated');
      setIsEditingTitle(false);
      mutateActivity();
    } catch {
      toast.error('Failed to update title');
    }
  };

  const startEditingDescription = () => {
    if (!canUpdateTask) return;
    setDescriptionValue(task.description || '');
    setIsEditingDescription(true);
  };

  const saveDescriptionEdit = async () => {
    if (descriptionValue === (task.description || '')) {
      setIsEditingDescription(false);
      return;
    }
    try {
      await updateTask({ description: descriptionValue.trim() });
      toast.success('Description updated');
      setIsEditingDescription(false);
      mutateActivity();
    } catch {
      toast.error('Failed to update description');
    }
  };

  const handleUpdateIntegrationSchedule = async (value: TaskFrequency) => {
    try {
      await updateTask({ integrationScheduleFrequency: value });
      toast.success('Schedule updated');
      mutateActivity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update schedule');
    }
  };

  const handleUpdateTask = async (
    updates: Partial<Pick<Task, 'status' | 'assigneeId' | 'approverId' | 'frequency' | 'reviewDate'>> & {
      department?: string | null;
      notRelevantJustification?: string;
    },
  ) => {
    try {
      await updateTask({
        status: updates.status,
        assigneeId: updates.assigneeId,
        approverId: updates.approverId,
        frequency: updates.frequency,
        department: updates.department,
        reviewDate: updates.reviewDate ? String(updates.reviewDate) : undefined,
        notRelevantJustification: updates.notRelevantJustification,
      });
      toast.success('Task updated');
      refreshAfterStatusChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update task');
    }
  };

  const handleApproveTask = async () => {
    try {
      await approveTaskFn();
      toast.success('Task approved');
      refreshAfterStatusChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve task');
    }
  };

  const handleRejectTask = async () => {
    try {
      await rejectTaskFn();
      toast.success('Task rejected');
      refreshAfterStatusChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject task');
    }
  };

  const handleWithdrawReview = async () => {
    try {
      await withdrawReview();
      toast.success('Review request withdrawn');
      refreshAfterStatusChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to withdraw the review request');
    }
  };

  const handleRequestApproval = () => {
    setSelectedApproverId(null);
    setRequestApprovalDialogOpen(true);
  };

  const handleSubmitForReview = async () => {
    if (!selectedApproverId) {
      toast.error('Please select an approver');
      return;
    }
    try {
      await submitForReview(selectedApproverId);
      toast.success('Task submitted for review');
      setRequestApprovalDialogOpen(false);
      refreshAfterStatusChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit for review');
    }
  };

  const isInReview = task.status === 'in_review';
  const isCurrentUserApprover =
    activeMember?.id && task.approverId && activeMember.id === task.approverId;
  const canApprove = evidenceApprovalEnabled && isInReview && isCurrentUserApprover;
  // Withdrawing needs task:update, the same permission the API checks (#44).
  const canWithdraw = evidenceApprovalEnabled && isInReview && canUpdateTask && !isCurrentUserApprover;
  // Comp AI sent platform-records evidence for this review (#42).
  const isAutoEvidenceReview = isInReview && !!task.nativeEvidenceSubmittedAt;
  const approverMember =
    !task.approverId || !members ? null : members.find((m) => m.id === task.approverId);

  return (
    <PageLayout>
      <Breadcrumb
        items={[
          {
            label: 'Evidence',
            href: `/${orgId}/tasks`,
            props: { render: <Link href={`/${orgId}/tasks`} /> },
          },
          { label: task.title, isCurrent: true },
        ]}
      />

      {/* Title + Description */}
      <Stack gap="xs">
        <HStack justify="between" align="center">
          {isEditingTitle ? (
            <input
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={saveTitleEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitleEdit();
                if (e.key === 'Escape') setIsEditingTitle(false);
              }}
              className="text-2xl font-semibold tracking-tight bg-transparent border-b border-primary outline-none flex-1"
              autoFocus
            />
          ) : (
            <HStack gap="sm" align="center">
              <h1
                onClick={startEditingTitle}
                className="text-2xl font-semibold tracking-tight cursor-pointer rounded px-1 -mx-1 hover:bg-muted/50 transition-colors"
              >
                {task.title}
              </h1>
              <TaskEvidenceSourceBadge taskId={task.id} orgId={orgId} automations={automations ?? []} />
            </HStack>
          )}
        </HStack>
        {isEditingDescription ? (
          <textarea
            value={descriptionValue}
            onChange={(e) => setDescriptionValue(e.target.value)}
            onBlur={saveDescriptionEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsEditingDescription(false);
            }}
            className="text-sm text-muted-foreground bg-transparent border-b border-primary outline-none resize-none w-full"
            rows={5}
            autoFocus
          />
        ) : (
          // CS-98: descriptions authored in the Framework Editor use markdown
          // (bullets, bold, headings). Plain-text rendering with whiteSpace:
          // pre-line preserved newlines but showed raw "**" and "- " syntax.
          // Render through the shared MarkdownRenderer so the app matches
          // what admins see in the editor preview.
          <div
            onClick={startEditingDescription}
            className="text-sm text-muted-foreground cursor-pointer"
          >
            {task.description ? (
              <MarkdownRenderer content={task.description} />
            ) : (
              'Add a description...'
            )}
          </div>
        )}
      </Stack>

      {/* Not Relevant Banner */}
      {task.status === 'not_relevant' && task.notRelevantJustification && (
        <NotRelevantBanner justification={task.notRelevantJustification} />
      )}

      {/* Automation moved a task with manual parts to review */}
      {isInReview && !task.approverId && <AutomationReviewBanner isAutoEvidence={isAutoEvidenceReview} />}

      {/* Approval Banner */}
      {evidenceApprovalEnabled && isInReview && task.approverId && (
        <ApprovalBanner
          canApprove={!!canApprove}
          canWithdraw={canWithdraw}
          approverMember={approverMember}
          isAutoEvidence={isAutoEvidenceReview}
          onApprove={handleApproveTask}
          onReject={handleRejectTask}
          onWithdraw={handleWithdrawReview}
        />
      )}

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <Stack gap="lg">
          <TabsList variant="underline">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {task.automationStatus !== 'MANUAL' && <TabsTrigger value="automations">Automations</TabsTrigger>}
            {(canReadPolicy || canReadControl) && (
              <TabsTrigger value="mappings">Mappings</TabsTrigger>
            )}
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Stack gap="lg">
              <TaskPropertiesSidebar
                handleUpdateTask={handleUpdateTask}
                evidenceApprovalEnabled={evidenceApprovalEnabled}
                onRequestApproval={handleRequestApproval}
              />
              <TaskNativeEvidence taskId={task.id} onTaskUpdated={() => mutateTask()} />
              <TaskStructuredEvidence taskId={task.id} />
              <Stack gap="sm">
                <Label>Comments</Label>
                <Comments
                  entityId={task.id}
                  entityType={CommentEntityType.task}
                  mentionResource="evidence"
                  organizationId={orgId}
                />
              </Stack>
              <TaskMainContent task={task} showComments={false} />
            </Stack>
          </TabsContent>

          <TabsContent value="mappings">
            <Stack gap="lg">
              {canReadControl && <RelatedControls entityType="task" entityId={task.id} />}
              {canReadPolicy && <TaskPolicies />}
            </Stack>
          </TabsContent>

          <TabsContent value="automations">
            <Stack gap="lg">
              <TaskIntegrationChecks
                taskId={task.id}
                onTaskUpdated={() => mutateTask()}
                isManualTask={task.automationStatus === 'MANUAL'}
                scheduleFrequency={task.integrationScheduleFrequency ?? undefined}
                lastRunAt={task.integrationLastRunAt ?? null}
                onScheduleChange={
                  canUpdateTask ? handleUpdateIntegrationSchedule : undefined
                }
              />
              <TaskAutomations
                automations={automations || []}
                isManualTask={task.automationStatus === 'MANUAL'}
              />
              {isWebAutomationsEnabled && (
                <BrowserAutomations
                  taskId={task.id}
                  isManualTask={task.automationStatus === 'MANUAL'}
                />
              )}
            </Stack>
          </TabsContent>

          <TabsContent value="comments">
            <Comments
              entityId={task.id}
              entityType={CommentEntityType.task}
              mentionResource="evidence"
              organizationId={orgId}
            />
          </TabsContent>

          <TabsContent value="activity">
            <TaskActivitySection taskId={taskId} />
          </TabsContent>

          <TabsContent value="settings">
            <Stack gap="lg">
              <HStack justify="between" align="center">
                <Stack gap="none">
                  <Text size="sm" weight="medium">Download Evidence</Text>
                  <Text size="xs" variant="muted">
                    Download all evidence for this task as a ZIP file
                  </Text>
                </Stack>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await downloadTaskEvidenceZip({ taskId: task.id, taskTitle: task.title, includeJson: true });
                      toast.success('Evidence downloaded');
                    } catch {
                      toast.error('Failed to download evidence');
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </HStack>

              <div className="border-t" />

              {canUpdateTask && (
                <>
                  <HStack justify="between" align="center">
                    <Stack gap="none">
                      <Text size="sm" weight="medium">Reset to Defaults</Text>
                      <Text size="xs" variant="muted">
                        Regenerate this evidence task using AI. All manual changes will be overwritten.
                      </Text>
                    </Stack>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRegenerateConfirmOpen(true)}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerate
                    </Button>
                  </HStack>
                  <div className="border-t" />
                </>
              )}
              {canDeleteTask && (
                <HStack justify="between" align="center">
                  <Stack gap="none">
                    <Text size="sm" weight="medium">Delete Evidence</Text>
                    <Text size="xs" variant="muted">
                      Permanently delete this evidence task and all associated data
                    </Text>
                  </Stack>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </HStack>
              )}
            </Stack>
          </TabsContent>
        </Stack>
      </Tabs>

      {/* Dialogs */}
      <TaskDeleteDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        task={task}
      />

      <Dialog open={isRegenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Task</DialogTitle>
            <DialogDescription>
              This will regenerate the task content using AI. Any manual changes will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerateConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setRegenerateConfirmOpen(false);
                try {
                  await regenerateTask();
                  toast.success('Task regenerated');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Failed to regenerate task');
                }
              }}
            >
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={requestApprovalDialogOpen} onOpenChange={setRequestApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Approval</DialogTitle>
            <DialogDescription>
              Select an approver to review this task.
            </DialogDescription>
          </DialogHeader>
          <SelectAssignee
            assignees={members?.filter((m) => m.id !== activeMember?.id) ?? []}
            assigneeId={selectedApproverId ?? ''}
            onAssigneeChange={(id) => setSelectedApproverId(id)}
            withTitle={false}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestApprovalDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitForReview} disabled={!selectedApproverId}>
              <SendHorizontal className="h-4 w-4 mr-2" />
              Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

function TaskActivitySection({ taskId }: { taskId: string }) {
  const { logs } = useAuditLogs({ entityType: 'task', entityId: taskId });
  return <RecentAuditLogs logs={logs} />;
}
