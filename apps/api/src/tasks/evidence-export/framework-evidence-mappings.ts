import { db } from '@db';
import type { MappedControl } from './framework-evidence-plan';

/** Every live requirement→control mapping of a framework instance with the control's evidence links. */
export async function loadMappings(
  frameworkInstanceId: string,
): Promise<MappedControl[]> {
  const rows = await db.requirementMap.findMany({
    where: {
      frameworkInstanceId,
      archivedAt: null,
      control: { archivedAt: null },
    },
    select: {
      requirementId: true,
      customRequirementId: true,
      control: {
        select: {
          id: true,
          controlTemplateId: true,
          name: true,
          frameworkPolicyLinks: {
            where: {
              frameworkInstanceId,
              policy: { archivedAt: null, isArchived: false },
            },
            select: { policyId: true },
          },
          frameworkTaskLinks: {
            where: { frameworkInstanceId, task: { archivedAt: null } },
            select: { taskId: true },
          },
          frameworkDocumentLinks: {
            where: { frameworkInstanceId },
            select: { formType: true },
          },
        },
      },
    },
  });

  return rows.map(({ requirementId, customRequirementId, control }) => ({
    requirementId,
    customRequirementId,
    control: {
      id: control.id,
      controlTemplateId: control.controlTemplateId,
      name: control.name,
      policyIds: control.frameworkPolicyLinks.map((l) => l.policyId),
      taskIds: control.frameworkTaskLinks.map((l) => l.taskId),
      formTypes: control.frameworkDocumentLinks.map((l) => l.formType),
    },
  }));
}
