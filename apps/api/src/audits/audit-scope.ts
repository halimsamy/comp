import { db } from '@db';
import {
  loadRequirementDefinitions,
  type RequirementDef,
} from '../frameworks/frameworks-requirements.helper';

export type AuditFramework = {
  id: string;
  frameworkId: string | null;
  customFrameworkId: string | null;
  currentVersionId: string | null;
  framework: { name: string } | null;
  customFramework: { name: string } | null;
};

export const auditFrameworkSelect = {
  id: true,
  frameworkId: true,
  customFrameworkId: true,
  currentVersionId: true,
  framework: { select: { name: true } },
  customFramework: { select: { name: true } },
} as const;

export function frameworkName(fi: AuditFramework): string {
  return fi.framework?.name ?? fi.customFramework?.name ?? 'Framework';
}

/** The framework's requirements, with the ones marked not applicable. */
export async function loadAuditRequirements({
  organizationId,
  framework,
}: {
  organizationId: string;
  framework: AuditFramework;
}): Promise<{ requirements: RequirementDef[]; notApplicable: Set<string> }> {
  const [requirements, notApplicable] = await Promise.all([
    loadRequirementDefinitions(framework),
    db.requirementApplicability.findMany({
      where: {
        organizationId,
        frameworkInstanceId: framework.id,
        status: 'not_applicable',
      },
      select: { requirementKey: true },
    }),
  ]);
  return {
    requirements,
    notApplicable: new Set(notApplicable.map((r) => r.requirementKey)),
  };
}

/** Ids of the requirements an auditor assesses (applicable ones). */
export function inScopeRequirementIds({
  requirements,
  notApplicable,
}: {
  requirements: RequirementDef[];
  notApplicable: Set<string>;
}): string[] {
  return requirements.map((r) => r.id).filter((id) => !notApplicable.has(id));
}
