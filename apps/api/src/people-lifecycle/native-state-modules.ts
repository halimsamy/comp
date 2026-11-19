import { db } from '@db';
import type { ModuleTrainingStatus } from '../training/training-modules.service';

interface TargetedMember {
  id: string;
  role: string;
  department: string;
}

/** Same targeting as `assignedModulesWhere`, evaluated in memory for many members. */
export function isModuleAssigned({
  module,
  member,
}: {
  module: { targetRoles: string[]; targetDepartments: string[] };
  member: { role: string; department: string };
}): boolean {
  const roles = member.role
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const roleOk =
    module.targetRoles.length === 0 ||
    module.targetRoles.some((r) => roles.includes(r));
  const departmentOk =
    module.targetDepartments.length === 0 ||
    module.targetDepartments.includes(member.department);
  return roleOk && departmentOk;
}

/** Role-based training status per member, from two queries. */
export async function moduleStatuses({
  organizationId,
  members,
  now,
}: {
  organizationId: string;
  members: TargetedMember[];
  now: Date;
}) {
  const result = new Map<
    string,
    {
      id: string;
      title: string;
      frameworkReference: string | null;
      status: ModuleTrainingStatus;
      completedAt: Date | null;
      expiresAt: Date | null;
    }[]
  >();
  const modules = await db.trainingModule.findMany({
    where: { organizationId, isEnabled: true },
    orderBy: { createdAt: 'asc' },
  });
  if (modules.length === 0 || members.length === 0) return result;
  const records = await db.trainingCompletionRecord.findMany({
    where: {
      organizationId,
      memberId: { in: members.map((m) => m.id) },
      moduleId: { in: modules.map((m) => m.id) },
    },
    select: { memberId: true, moduleId: true, completedAt: true, expiresAt: true },
    orderBy: { completedAt: 'desc' },
  });
  for (const member of members) {
    result.set(
      member.id,
      modules
        .filter((module) => isModuleAssigned({ module, member }))
        .map((module) => {
          const last =
            records.find((r) => r.memberId === member.id && r.moduleId === module.id) ?? null;
          const status: ModuleTrainingStatus = !last
            ? 'not_started'
            : last.expiresAt > now
              ? 'completed'
              : 'expired';
          return {
            id: module.id,
            title: module.title,
            frameworkReference: module.frameworkReference,
            status,
            completedAt: last?.completedAt ?? null,
            expiresAt: last?.expiresAt ?? null,
          };
        }),
    );
  }
  return result;
}
