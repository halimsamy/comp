import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { parseDate, parseSystemKey } from './access-accounts.lib';
import type { ImportAccountDto } from './dto/access-accounts.dto';

/**
 * Manual systems (no integration; accounts come from a CSV import) and the
 * owner mapping for accounts that email matching can't place.
 */
@Injectable()
export class AccessSystemsService {
  async create({
    organizationId,
    name,
    description,
  }: {
    organizationId: string;
    name: string;
    description?: string;
  }) {
    const trimmed = name.trim();
    const existing = await db.accessSystem.findFirst({
      where: { organizationId, name: trimmed },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('A system with this name already exists');
    const system = await db.accessSystem.create({
      data: {
        organizationId,
        name: trimmed,
        description: description?.trim() || null,
      },
    });
    return { ...system, key: `manual:${system.id}` };
  }

  async remove({ organizationId, id }: { organizationId: string; id: string }) {
    const system = await this.find({ organizationId, id });
    await db.$transaction([
      db.accessAccountOwner.deleteMany({
        where: { organizationId, systemKey: `manual:${system.id}` },
      }),
      db.accessSystem.delete({ where: { id: system.id } }),
    ]);
    return { deleted: true };
  }

  /** Replace the system's accounts with the imported list (a fresh inventory). */
  async importAccounts({
    organizationId,
    id,
    accounts,
  }: {
    organizationId: string;
    id: string;
    accounts: ImportAccountDto[];
  }) {
    const system = await this.find({ organizationId, id });
    const unique = new Map<string, ImportAccountDto>();
    for (const account of accounts)
      unique.set(account.accountId.trim(), account);
    const rows = [...unique.entries()].map(([externalId, a]) => ({
      systemId: system.id,
      externalId,
      name: a.name?.trim() || null,
      email: a.email?.trim().toLowerCase() || null,
      type: a.type ?? null,
      status: a.status ?? 'active',
      roles: (a.roles ?? []).map((r) => r.trim()).filter(Boolean),
      isAdmin: Boolean(a.isAdmin),
      mfaEnabled: a.mfaEnabled ?? null,
      lastLoginAt: parseDate(a.lastLoginAt),
      accountCreatedAt: parseDate(a.createdAt),
    }));
    await db.$transaction([
      db.accessSystemAccount.deleteMany({ where: { systemId: system.id } }),
      db.accessSystemAccount.createMany({ data: rows }),
      db.accessSystem.update({
        where: { id: system.id },
        data: { importedAt: new Date() },
      }),
    ]);
    return { imported: rows.length };
  }

  /** Map an account to a member, mark it a service account, or clear the mapping. */
  async setOwner({
    organizationId,
    callerMemberId,
    systemKey,
    accountId,
    memberId,
    isServiceAccount,
    justification,
  }: {
    organizationId: string;
    callerMemberId?: string;
    systemKey: string;
    accountId: string;
    memberId?: string | null;
    isServiceAccount?: boolean;
    justification?: string | null;
  }) {
    if (!parseSystemKey(systemKey))
      throw new BadRequestException('Invalid system key');
    if (memberId && isServiceAccount) {
      throw new BadRequestException('A service account has no member owner');
    }
    if (isServiceAccount && !justification?.trim()) {
      throw new BadRequestException(
        'Explain what the service account is used for',
      );
    }
    const where = {
      organizationId_systemKey_accountId: {
        organizationId,
        systemKey,
        accountId,
      },
    };
    if (!memberId && !isServiceAccount) {
      await db.accessAccountOwner.deleteMany({
        where: { organizationId, systemKey, accountId },
      });
      return { cleared: true };
    }
    if (memberId) {
      const member = await db.member.findFirst({
        where: { id: memberId, organizationId },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('Member not found');
    }
    const data = {
      memberId: memberId ?? null,
      isServiceAccount: Boolean(isServiceAccount),
      justification: justification?.trim() || null,
      updatedById: callerMemberId ?? null,
    };
    return db.accessAccountOwner.upsert({
      where,
      create: { organizationId, systemKey, accountId, ...data },
      update: data,
    });
  }

  private async find({
    organizationId,
    id,
  }: {
    organizationId: string;
    id: string;
  }) {
    const system = await db.accessSystem.findFirst({
      where: { id, organizationId },
    });
    if (!system) throw new NotFoundException('System not found');
    return system;
  }
}
