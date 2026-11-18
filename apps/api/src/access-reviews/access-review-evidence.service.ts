import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { TASK_TEMPLATES } from '@trycompai/integration-platform';
import { AttachmentsService } from '../attachments/attachments.service';
import { completedTaskData } from '../tasks/task-completion';
import { renderAccessReviewPdf } from './access-review-report';

/** The access review PDF, and attaching it to the Access Review Log task on sign-off. */
@Injectable()
export class AccessReviewEvidenceService {
  constructor(private readonly attachments: AttachmentsService) {}

  async report({ organizationId, id }: { organizationId: string; id: string }) {
    const [review, org] = await Promise.all([
      this.loadReview({ organizationId, id }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, primaryColor: true },
      }),
    ]);
    const buffer = renderAccessReviewPdf({
      review,
      organizationName: org?.name ?? null,
      primaryColor: org?.primaryColor ?? null,
    });
    const slug = review.name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return { buffer, filename: `access-review-${slug || review.id}.pdf` };
  }

  async attachToTask({
    organizationId,
    id,
    userId,
    signedOffAt,
  }: {
    organizationId: string;
    id: string;
    userId?: string;
    signedOffAt: Date;
  }) {
    const task = await db.task.findFirst({
      where: { organizationId, taskTemplateId: TASK_TEMPLATES.accessReviewLog },
      select: { id: true, frequency: true, status: true },
    });
    if (!task) return;
    const { buffer, filename } = await this.report({ organizationId, id });
    const attachment = await this.attachments.uploadAttachment(
      organizationId,
      task.id,
      'task',
      {
        fileName: filename,
        fileType: 'application/pdf',
        fileData: buffer.toString('base64'),
        description: 'Signed-off user access review',
      },
      userId,
    );
    await db.$transaction([
      ...(task.status === 'not_relevant'
        ? []
        : [
            db.task.update({
              where: { id: task.id },
              data: completedTaskData(task.frequency, signedOffAt),
            }),
          ]),
      db.accessReview.update({
        where: { id },
        data: { taskId: task.id, reportAttachmentId: attachment.id },
      }),
    ]);
  }

  private async loadReview({
    organizationId,
    id,
  }: {
    organizationId: string;
    id: string;
  }) {
    const review = await db.accessReview.findFirst({
      where: { id, organizationId },
      include: {
        systems: { orderBy: { systemName: 'asc' } },
        items: { orderBy: [{ accountName: 'asc' }] },
      },
    });
    if (!review) throw new NotFoundException('Access review not found');
    return review;
  }
}
