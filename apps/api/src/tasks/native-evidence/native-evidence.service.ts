import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db, type TaskStatus } from '@db';
import { AttachmentsService } from '../../attachments/attachments.service';
import { renderNativeEvidencePdf } from './native-evidence-pdf';
import { NATIVE_EVIDENCE_RULES, ruleForTemplate } from './native-evidence-rules';

/** Statuses auto-evidence may move to review. Never done / in review / not relevant. */
const SUBMITTABLE: TaskStatus[] = ['todo', 'in_progress', 'failed'];

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  frequency: true,
  taskTemplateId: true,
  lastCompletedAt: true,
  nativeEvidenceFingerprint: true,
  nativeEvidenceSubmittedAt: true,
  nativeEvidenceAttachmentId: true,
} as const;

/**
 * The same evidence was already sent to review in this cycle. A rejected
 * submission is not resent until the evidence changes or the task is completed.
 */
export function alreadySubmitted({
  task,
  fingerprint,
}: {
  task: {
    nativeEvidenceFingerprint: string | null;
    nativeEvidenceSubmittedAt: Date | null;
    lastCompletedAt: Date | null;
  };
  fingerprint: string;
}): boolean {
  if (task.nativeEvidenceFingerprint !== fingerprint || !task.nativeEvidenceSubmittedAt) return false;
  return !task.lastCompletedAt || task.nativeEvidenceSubmittedAt > task.lastCompletedAt;
}

export type SubmitOutcome = 'submitted' | 'not_met' | 'not_open' | 'unchanged';

@Injectable()
export class NativeEvidenceService {
  private readonly logger = new Logger(NativeEvidenceService.name);

  constructor(private readonly attachments: AttachmentsService) {}

  private async loadTask({ organizationId, taskId }: { organizationId: string; taskId: string }) {
    const task = await db.task.findFirst({
      where: { id: taskId, organizationId, archivedAt: null },
      select: TASK_SELECT,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /** Live status of the task's native-state rule, or null when the task has none. */
  async getStatus({
    organizationId,
    taskId,
    now = new Date(),
  }: {
    organizationId: string;
    taskId: string;
    now?: Date;
  }) {
    const task = await this.loadTask({ organizationId, taskId });
    const rule = ruleForTemplate(task.taskTemplateId);
    if (!rule) return { data: null };
    const result = await rule.evaluate({ organizationId, now, frequency: task.frequency });
    return {
      data: {
        ruleKey: rule.key,
        module: rule.module,
        title: rule.title,
        reference: rule.reference,
        path: rule.path,
        holds: result.holds,
        summary: result.summary,
        issues: result.issues,
        evaluatedAt: now,
        lastSubmittedAt: task.nativeEvidenceSubmittedAt,
        attachmentId: task.nativeEvidenceAttachmentId,
        canSubmit: result.holds && SUBMITTABLE.includes(task.status),
      },
    };
  }

  /**
   * When the rule holds: attach a dated snapshot PDF and move the task to
   * in_review (never done — a person signs off). `force` skips the
   * unchanged-evidence check for a person's explicit request.
   */
  async submit({
    organizationId,
    taskId,
    userId,
    force = false,
    now = new Date(),
  }: {
    organizationId: string;
    taskId: string;
    userId?: string;
    force?: boolean;
    now?: Date;
  }): Promise<{ outcome: SubmitOutcome; attachmentId?: string }> {
    const task = await this.loadTask({ organizationId, taskId });
    const rule = ruleForTemplate(task.taskTemplateId);
    if (!rule) throw new NotFoundException('This task has no auto-evidence rule');
    if (!SUBMITTABLE.includes(task.status)) return { outcome: 'not_open' };

    const result = await rule.evaluate({ organizationId, now, frequency: task.frequency });
    if (!result.holds) return { outcome: 'not_met' };
    if (!force && alreadySubmitted({ task, fingerprint: result.fingerprint })) {
      return { outcome: 'unchanged' };
    }

    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, primaryColor: true },
    });
    const { buffer, filename } = renderNativeEvidencePdf({
      rule,
      result,
      taskTitle: task.title,
      organizationName: org?.name ?? null,
      primaryColor: org?.primaryColor ?? null,
      now,
    });
    const attachment = await this.attachments.uploadAttachment(
      organizationId,
      task.id,
      'task',
      {
        fileName: filename,
        fileType: 'application/pdf',
        fileData: buffer.toString('base64'),
        description: `Auto-evidence from ${rule.module}: ${result.summary}`,
      },
      userId,
    );
    // Conditional update: a person may have changed the status meanwhile.
    await db.task.updateMany({
      where: { id: task.id, organizationId, status: { in: SUBMITTABLE } },
      data: {
        status: 'in_review',
        previousStatus: task.status,
        nativeEvidenceFingerprint: result.fingerprint,
        nativeEvidenceSubmittedAt: now,
        nativeEvidenceAttachmentId: attachment.id,
      },
    });
    return { outcome: 'submitted', attachmentId: attachment.id };
  }

  /** Scheduled pass over every open task that has a rule (run by task-schedule). */
  async evaluateAll(now = new Date()) {
    const tasks = await db.task.findMany({
      where: {
        taskTemplateId: { in: Object.keys(NATIVE_EVIDENCE_RULES) },
        status: { in: SUBMITTABLE },
        archivedAt: null,
      },
      select: { id: true, organizationId: true },
    });
    const outcomes: Record<SubmitOutcome | 'error', number> = {
      submitted: 0,
      not_met: 0,
      not_open: 0,
      unchanged: 0,
      error: 0,
    };
    for (const task of tasks) {
      try {
        const { outcome } = await this.submit({ organizationId: task.organizationId, taskId: task.id, now });
        outcomes[outcome] += 1;
      } catch (error) {
        // One task's failure must not stop the others.
        outcomes.error += 1;
        this.logger.error(`Auto-evidence failed for task ${task.id}`, error instanceof Error ? error.stack : String(error));
      }
    }
    return { checked: tasks.length, ...outcomes };
  }
}
