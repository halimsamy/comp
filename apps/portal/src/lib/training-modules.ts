import type { Prisma } from '@db';
import { db } from '@db/server';

/** Custom modules assigned to a member (mirrors assignedModulesWhere in apps/api training-modules.service). */
export function assignedModulesWhere({
  organizationId,
  role,
  department,
}: {
  organizationId: string;
  role: string;
  department: string;
}): Prisma.TrainingModuleWhereInput {
  const roles = role
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  return {
    organizationId,
    isEnabled: true,
    AND: [
      { OR: [{ targetRoles: { isEmpty: true } }, { targetRoles: { hasSome: roles } }] },
      {
        OR: [
          { targetDepartments: { isEmpty: true } },
          ...(department ? [{ targetDepartments: { has: department } }] : []),
        ],
      },
    ],
  };
}

export interface PortalTrainingModule {
  id: string;
  title: string;
  description: string | null;
  contentUrl: string | null;
  frameworkReference: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
}

export async function getPortalTrainingModules({
  organizationId,
  memberId,
  role,
  department,
  now = new Date(),
}: {
  organizationId: string;
  memberId: string;
  role: string;
  department: string;
  now?: Date;
}): Promise<PortalTrainingModule[]> {
  const modules = await db.trainingModule.findMany({
    where: assignedModulesWhere({ organizationId, role, department }),
    orderBy: { createdAt: 'asc' },
  });
  if (modules.length === 0) return [];

  const records = await db.trainingCompletionRecord.findMany({
    where: { organizationId, memberId, moduleId: { in: modules.map((m) => m.id) } },
    orderBy: { completedAt: 'desc' },
  });

  return modules.map((m) => {
    const latest = records.find((r) => r.moduleId === m.id);
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      contentUrl: m.contentUrl,
      frameworkReference: m.frameworkReference,
      completedAt: latest?.completedAt.toISOString() ?? null,
      expiresAt: latest?.expiresAt.toISOString() ?? null,
      isCurrent: !!latest && latest.expiresAt > now,
    };
  });
}
