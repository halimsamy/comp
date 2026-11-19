import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db, Prisma } from '@db';
import { findMemberName } from './access-review-guards';
import { parseSystemKey } from './access-accounts.lib';
import type {
  AllowedAccountTypesDto,
  CreateAccessRoleDto,
  UpdateAccessRoleDto,
} from './dto/access-roles.dto';

/**
 * Approved roles per system and allowed account types (#159, #172, #177).
 * Replaces the RBAC Matrix and Account Types forms: review items are flagged
 * when an account holds a role that is not in this catalog.
 */
@Injectable()
export class AccessRolesService {
  list({ organizationId, systemKey }: { organizationId: string; systemKey?: string }) {
    return db.accessSystemRole.findMany({
      where: { organizationId, ...(systemKey && { systemKey }) },
      orderBy: [{ systemName: 'asc' }, { name: 'asc' }],
    });
  }

  async create({
    organizationId,
    callerMemberId,
    dto,
  }: {
    organizationId: string;
    callerMemberId?: string;
    dto: CreateAccessRoleDto;
  }) {
    if (!parseSystemKey(dto.systemKey)) throw new BadRequestException('Invalid system key');
    const approver = await this.approver({ organizationId, memberId: dto.approvedById ?? callerMemberId });
    try {
      return await db.accessSystemRole.create({
        data: {
          organizationId,
          systemKey: dto.systemKey,
          systemName: dto.systemName.trim(),
          name: dto.name.trim(),
          permissionsScope: dto.permissionsScope?.trim() || null,
          isPrivileged: dto.isPrivileged ?? false,
          ...approver,
          approvedAt: approver.approvedById ? new Date() : null,
          lastReviewedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This system already has a role with that name');
      }
      throw error;
    }
  }

  async update({
    organizationId,
    id,
    dto,
  }: {
    organizationId: string;
    id: string;
    dto: UpdateAccessRoleDto;
  }) {
    await this.find({ organizationId, id });
    const approver =
      dto.approvedById !== undefined
        ? await this.approver({ organizationId, memberId: dto.approvedById ?? undefined })
        : {};
    return db.accessSystemRole.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.permissionsScope !== undefined && {
          permissionsScope: dto.permissionsScope?.trim() || null,
        }),
        ...(dto.isPrivileged !== undefined && { isPrivileged: dto.isPrivileged }),
        ...approver,
        ...('approvedById' in approver && { approvedAt: approver.approvedById ? new Date() : null }),
        lastReviewedAt: new Date(),
      },
    });
  }

  async remove({ organizationId, id }: { organizationId: string; id: string }) {
    await this.find({ organizationId, id });
    await db.accessSystemRole.delete({ where: { id } });
    return { deleted: true };
  }

  /** Allowed account types of a manual system (human / service / shared, with justification). */
  async setAllowedTypes({
    organizationId,
    systemId,
    dto,
  }: {
    organizationId: string;
    systemId: string;
    dto: AllowedAccountTypesDto;
  }) {
    const system = await db.accessSystem.findFirst({ where: { id: systemId, organizationId } });
    if (!system) throw new NotFoundException('System not found');
    const value = Object.fromEntries(
      dto.types.map((t) => [t.type, { allowed: t.allowed, justification: t.justification?.trim() || null }]),
    );
    return db.accessSystem.update({
      where: { id: system.id },
      data: { allowedAccountTypes: value },
      select: { id: true, allowedAccountTypes: true },
    });
  }

  private async approver({ organizationId, memberId }: { organizationId: string; memberId?: string }) {
    if (!memberId) return { approvedById: null, approvedByName: null };
    const name = await findMemberName({ organizationId, memberId });
    if (!name) throw new NotFoundException('Approver not found');
    return { approvedById: memberId, approvedByName: name };
  }

  private async find({ organizationId, id }: { organizationId: string; id: string }) {
    const role = await db.accessSystemRole.findFirst({ where: { id, organizationId } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }
}
