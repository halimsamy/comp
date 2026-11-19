import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db, Departments, type Prisma } from '@db';
import type {
  CreateTrainingModuleDto,
  UpdateTrainingModuleDto,
} from './dto/training-module.dto';
import { addMonths } from './training-cycles';

export type ModuleTrainingStatus = 'completed' | 'expired' | 'not_started';

function isDepartment(value: string): value is Departments {
  return Object.values(Departments).some((d) => d === value);
}

/** Prisma filter for the custom modules a member must take (role and department targeting). */
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
          ...(isDepartment(department)
            ? [{ targetDepartments: { has: department } }]
            : []),
        ],
      },
    ],
  };
}

@Injectable()
export class TrainingModulesService {
  list(organizationId: string) {
    return db.trainingModule.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create({
    organizationId,
    dto,
  }: {
    organizationId: string;
    dto: CreateTrainingModuleDto;
  }) {
    return db.trainingModule.create({ data: { ...dto, organizationId } });
  }

  async update({
    organizationId,
    moduleId,
    dto,
  }: {
    organizationId: string;
    moduleId: string;
    dto: UpdateTrainingModuleDto;
  }) {
    await this.findModule({ organizationId, moduleId });
    return db.trainingModule.update({ where: { id: moduleId }, data: dto });
  }

  /** Completion history is audit evidence, so modules are disabled rather than deleted. */
  async disable({
    organizationId,
    moduleId,
  }: {
    organizationId: string;
    moduleId: string;
  }) {
    await this.findModule({ organizationId, moduleId });
    return db.trainingModule.update({
      where: { id: moduleId },
      data: { isEnabled: false },
    });
  }

  async getMemberModules({
    organizationId,
    memberId,
    now = new Date(),
  }: {
    organizationId: string;
    memberId: string;
    now?: Date;
  }) {
    const member = await this.findMember({ organizationId, memberId });
    const modules = await db.trainingModule.findMany({
      where: assignedModulesWhere({
        organizationId,
        role: member.role,
        department: member.department,
      }),
      orderBy: { createdAt: 'asc' },
    });
    if (modules.length === 0) return [];

    const records = await db.trainingCompletionRecord.findMany({
      where: {
        organizationId,
        memberId,
        moduleId: { in: modules.map((m) => m.id) },
      },
      orderBy: { completedAt: 'desc' },
    });

    return modules.map((module) => {
      const latest = records.find((r) => r.moduleId === module.id) ?? null;
      const status: ModuleTrainingStatus = !latest
        ? 'not_started'
        : latest.expiresAt > now
          ? 'completed'
          : 'expired';
      return {
        ...module,
        status,
        completedAt: latest?.completedAt ?? null,
        expiresAt: latest?.expiresAt ?? null,
      };
    });
  }

  /** Records a completion for an assigned module (portal self-service or an admin recording offline training). */
  async completeModule({
    organizationId,
    memberId,
    moduleId,
    completedAt = new Date(),
  }: {
    organizationId: string;
    memberId: string;
    moduleId: string;
    completedAt?: Date;
  }) {
    if (completedAt.getTime() > Date.now()) {
      throw new BadRequestException('The completion date cannot be in the future');
    }
    const member = await this.findMember({ organizationId, memberId });
    const module = await db.trainingModule.findFirst({
      where: {
        id: moduleId,
        ...assignedModulesWhere({
          organizationId,
          role: member.role,
          department: member.department,
        }),
      },
    });
    if (!module) {
      throw new NotFoundException('Training module is not assigned to this member');
    }

    return db.trainingCompletionRecord.create({
      data: {
        organizationId,
        memberId,
        moduleId,
        completedAt,
        expiresAt: addMonths({ date: completedAt, months: module.recurrenceMonths }),
      },
    });
  }

  private async findModule({
    organizationId,
    moduleId,
  }: {
    organizationId: string;
    moduleId: string;
  }) {
    const module = await db.trainingModule.findFirst({
      where: { id: moduleId, organizationId },
    });
    if (!module) throw new NotFoundException('Training module not found');
    return module;
  }

  private async findMember({
    organizationId,
    memberId,
  }: {
    organizationId: string;
    memberId: string;
  }) {
    const member = await db.member.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, role: true, department: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }
}
