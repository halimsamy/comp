import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { parseDate, parseSystemKey } from './access-accounts.lib';
import { AccessAccountsService } from './access-accounts.service';
import { reconcileRevocations } from './access-review-reconcile';
import { importedOwnerMappings } from './import-owner-mappings';
import type { ImportAccountDto } from './dto/access-accounts.dto';

/**
 * Manual systems (no integration; accounts come from a CSV import) and the
 * owner mapping for accounts that email matching can't place.
 */
@Injectable()
export class AccessSystemsService {
  constructor(private readonly accounts: AccessAccountsService) {}

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
    const rows = [...unique.entries()].map(([externalId, a]) =>
      toAccountRow({ systemId: system.id, externalId, account: a }),
    );
    const mappings = await importedOwnerMappings({
      organizationId,
      systemKey: `manual:${system.id}`,
      accounts: [...unique.entries()],
    });
    await db.$transaction([
      db.accessSystemAccount.deleteMany({ where: { systemId: system.id } }),
      db.accessSystemAccount.createMany({ data: rows }),
      db.accessSystem.update({
        where: { id: system.id },
        data: { importedAt: new Date() },
      }),
      ...mappings,
    ]);
    // A fresh inventory confirms (or contradicts) pending revocations; the import itself is already saved.
    await reconcileRevocations({ organizationId, accounts: this.accounts }).catch(() => undefined);
    return { imported: rows.length, ownersMapped: mappings.length };
  }

  /** Add one account to a manual system, or update it when the account id exists. */
  async addAccount({
    organizationId,
    id,
    account,
  }: {
    organizationId: string;
    id: string;
    account: ImportAccountDto;
  }) {
    const system = await this.find({ organizationId, id });
    const externalId = account.accountId.trim();
    const row = toAccountRow({ systemId: system.id, externalId, account });
    const mappings = await importedOwnerMappings({
      organizationId,
      systemKey: `manual:${system.id}`,
      accounts: [[externalId, account]],
    });
    await db.$transaction([
      db.accessSystemAccount.upsert({
        where: { systemId_externalId: { systemId: system.id, externalId } },
        create: row,
        update: row,
      }),
      ...mappings,
    ]);
    return { accountId: externalId };
  }

  /** Remove one account (e.g. after revoking it), with its owner mapping. */
  async removeAccount({
    organizationId,
    id,
    accountId,
  }: {
    organizationId: string;
    id: string;
    accountId: string;
  }) {
    const system = await this.find({ organizationId, id });
    const [{ count }] = await db.$transaction([
      db.accessSystemAccount.deleteMany({
        where: { systemId: system.id, externalId: accountId },
      }),
      db.accessAccountOwner.deleteMany({
        where: { organizationId, systemKey: `manual:${system.id}`, accountId },
      }),
    ]);
    if (count === 0) throw new NotFoundException('Account not found');
    // The account is gone, which confirms a pending revocation of it.
    await reconcileRevocations({ organizationId, accounts: this.accounts }).catch(() => undefined);
    return { deleted: true };
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

function toAccountRow({
  systemId,
  externalId,
  account: a,
}: {
  systemId: string;
  externalId: string;
  account: ImportAccountDto;
}) {
  return {
    systemId,
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
  };
}
