import { db } from '@db';
import { evidenceFormDefinitionList, toDbEvidenceFormType } from '@trycompai/company';
import type { MappedControl } from './framework-evidence-plan';
import { personName } from './registers/register-csv';

/** Forms retired in favour of a module (Network Diagram, RBAC Matrix, ...): never exported. */
export const RETIRED_FORM_TYPES = evidenceFormDefinitionList
  .filter((f) => f.retiredTo)
  .map((f) => toDbEvidenceFormType(f.type));

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
          owner: { select: { user: { select: { name: true, email: true } } } },
          frameworkPolicyLinks: {
            where: {
              frameworkInstanceId,
              policy: { archivedAt: null, isArchived: false },
            },
            select: { policyId: true },
          },
          frameworkTaskLinks: {
            // A not-relevant task is not evidence for anything.
            where: {
              frameworkInstanceId,
              task: { archivedAt: null, status: { not: 'not_relevant' } },
            },
            select: { taskId: true },
          },
          frameworkDocumentLinks: {
            where: { frameworkInstanceId, formType: { notIn: RETIRED_FORM_TYPES } },
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
      owner: personName(control.owner?.user) || null,
      policyIds: control.frameworkPolicyLinks.map((l) => l.policyId),
      taskIds: control.frameworkTaskLinks.map((l) => l.taskId),
      formTypes: control.frameworkDocumentLinks.map((l) => l.formType),
    },
  }));
}
