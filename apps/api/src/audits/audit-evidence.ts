import { db, type EvidenceFormType } from '@db';
import { attachmentValidInPeriod } from '../attachments/attachment-validity';
import { taskNeedsUpdate, type TaskEvidence } from './audit-readiness';

/** Status of the tasks, policies and document forms an audit's requirements use. */
export async function loadAuditEvidence({
  organizationId,
  period,
  taskIds,
  policyIds,
  formTypes,
  now = new Date(),
}: {
  organizationId: string;
  period: { from: Date; to: Date };
  taskIds: string[];
  policyIds: string[];
  formTypes: EvidenceFormType[];
  now?: Date;
}) {
  const [tasks, files, policies, submissions] = await Promise.all([
    db.task.findMany({
      where: { organizationId, id: { in: taskIds } },
      select: { id: true, title: true, status: true },
    }),
    db.attachment.findMany({
      where: { organizationId, entityType: 'task', entityId: { in: taskIds } },
      select: { entityId: true, createdAt: true, validFrom: true, validUntil: true },
    }),
    db.policy.findMany({
      where: { organizationId, id: { in: policyIds } },
      select: { id: true, name: true, status: true },
    }),
    db.evidenceSubmission.groupBy({
      by: ['formType'],
      where: {
        organizationId,
        formType: { in: formTypes },
        status: { not: 'rejected' },
        submittedAt: { gte: period.from, lte: period.to },
      },
      _count: { _all: true },
    }),
  ]);

  const filesByTask = new Map<string, typeof files>();
  for (const file of files) {
    filesByTask.set(file.entityId, [...(filesByTask.get(file.entityId) ?? []), file]);
  }

  return {
    tasks: new Map<string, TaskEvidence>(
      tasks.map((task) => {
        const taskFiles = filesByTask.get(task.id) ?? [];
        return [
          task.id,
          {
            id: task.id,
            title: task.title,
            status: task.status,
            filesInPeriod: taskFiles.filter((f) => attachmentValidInPeriod(f, period)).length,
            needsUpdate: taskNeedsUpdate(taskFiles, now),
          },
        ];
      }),
    ),
    policies: new Map(policies.map((p) => [p.id, p])),
    submissions: new Map(submissions.map((s) => [s.formType, s._count._all])),
  };
}
