import { NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { toDbEvidenceFormType } from '@trycompai/company';
import { evidenceFormDefinitions } from '../evidence-forms/evidence-forms.definitions';
import { listFormDeadlines } from '../evidence-forms/form-deadlines';

/**
 * "Structured evidence for this task" (#173): the company forms that the
 * task's controls ask for (task → control → form, direct or framework-scoped),
 * with their deadline status. Retired forms point to the module that replaced them.
 */
export async function listTaskForms({ organizationId, taskId }: { organizationId: string; taskId: string }) {
  const task = await db.task.findFirst({ where: { id: taskId, organizationId }, select: { id: true } });
  if (!task) throw new NotFoundException('Task not found');

  const controls = await db.control.findMany({
    where: {
      organizationId,
      OR: [{ tasks: { some: { id: taskId } } }, { frameworkTaskLinks: { some: { taskId } } }],
    },
    select: {
      controlDocumentTypes: { select: { formType: true } },
      frameworkDocumentLinks: { select: { formType: true } },
    },
  });
  const linked = new Set(
    controls.flatMap((c) => [...c.controlDocumentTypes, ...c.frameworkDocumentLinks].map((l) => l.formType)),
  );
  if (linked.size === 0) return [];

  const deadlines = await listFormDeadlines(organizationId);
  return deadlines
    .filter((form) => linked.has(toDbEvidenceFormType(form.formType)))
    .map((form) => {
      const definition = evidenceFormDefinitions[form.formType];
      return {
        formType: form.formType,
        title: form.title,
        status: form.status,
        lastSubmittedAt: form.lastSubmittedAt,
        nextDueAt: form.nextDueAt,
        retiredTo: definition.retiredTo ?? null,
        // Matrix forms (registers) can be filled from a CSV.
        hasMatrix: definition.fields.some((field) => field.type === 'matrix'),
      };
    });
}
