import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import { TASK_TEMPLATES } from '@trycompai/integration-platform';
import { CheckRunRepository } from '../integration-platform/repositories/check-run.repository';
import { ConnectionRepository } from '../integration-platform/repositories/connection.repository';
import { CheckResultsService } from '../integration-platform/services/check-results.service';
import {
  accountFromCheckRow,
  AllowedAccountTypesSchema,
  parseSystemKey,
  type AllowedAccountTypes,
  type BaseAccount,
  type InventoryAccount,
  type SystemKind,
} from './access-accounts.lib';
import { decorateAccounts, loadOwnerContext } from './access-owners';

export interface AccessSystemInfo {
  key: string;
  name: string;
  kind: SystemKind;
  logoUrl: string | null;
  description: string | null;
  lastSyncAt: string | null;
  /** Manual systems only: which account types are allowed (#177). */
  allowedAccountTypes?: AllowedAccountTypes;
}

interface SystemSource extends AccessSystemInfo {
  connectionId?: string;
  checkIds?: string[];
  manualId?: string;
  importedAt?: Date | null;
}

const PRIVILEGED_ROLES = new Set(['owner', 'admin']);

/**
 * Account inventory per system (Vanta "Access > Accounts"): Comp AI's own
 * members, every connected integration whose check is bound to the Employee
 * Access task (via CheckResultsService), and manual systems from CSV imports.
 * Owners are matched by email, or by a manual mapping.
 */
@Injectable()
export class AccessAccountsService {
  constructor(private readonly checkResults: CheckResultsService) {}

  async listSystems(organizationId: string) {
    const all = await this.listAllAccounts(organizationId);
    return all.map(({ system, accounts }) => ({
      ...system,
      accountCount: accounts.length,
      flaggedCount: accounts.filter((a) => a.flags.length > 0).length,
    }));
  }

  /** Every system with its decorated accounts (exports, offboarding, revocation checks). */
  async listAllAccounts(
    organizationId: string,
  ): Promise<{ system: AccessSystemInfo; accounts: InventoryAccount[] }[]> {
    const [systems, owners] = await Promise.all([
      this.loadSystems(organizationId),
      loadOwnerContext(organizationId),
    ]);
    const now = new Date();
    return Promise.all(
      systems.map(async (system) => ({
        system: publicInfo(system),
        accounts: decorateAccounts({
          systemKey: system.key,
          accounts: await this.loadAccounts({ organizationId, system }),
          owners,
          now,
        }),
      })),
    );
  }

  /** One member's accounts across every system (#83, #82). */
  async listMemberAccounts({
    organizationId,
    memberId,
  }: {
    organizationId: string;
    memberId: string;
  }) {
    const all = await this.listAllAccounts(organizationId);
    return all.flatMap(({ system, accounts }) =>
      accounts
        .filter((a) => a.owner?.memberId === memberId)
        .map((account) => ({ ...account, system })),
    );
  }

  async getSystemAccounts({
    organizationId,
    systemKey,
  }: {
    organizationId: string;
    systemKey: string;
  }): Promise<{ system: AccessSystemInfo; accounts: InventoryAccount[] }> {
    if (!parseSystemKey(systemKey))
      throw new BadRequestException('Invalid system key');
    const systems = await this.loadSystems(organizationId);
    const system = systems.find((s) => s.key === systemKey);
    if (!system) throw new NotFoundException('System not found');
    const [accounts, owners] = await Promise.all([
      this.loadAccounts({ organizationId, system }),
      loadOwnerContext(organizationId),
    ]);
    return {
      system: publicInfo(system),
      accounts: decorateAccounts({
        systemKey,
        accounts,
        owners,
        now: new Date(),
      }),
    };
  }

  private async loadSystems(organizationId: string): Promise<SystemSource[]> {
    const [sources, manual] = await Promise.all([
      this.checkResults.listSourcesBoundToTask(
        organizationId,
        TASK_TEMPLATES.employeeAccess,
      ),
      db.accessSystem.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
      }),
    ]);
    const integrations = new Map<string, SystemSource>();
    for (const source of sources) {
      if (!source.connected || !source.connectionId) continue;
      const existing = integrations.get(source.connectionId);
      if (existing) {
        existing.checkIds?.push(source.checkId);
        continue;
      }
      integrations.set(source.connectionId, {
        key: `connection:${source.connectionId}`,
        name: source.name,
        kind: 'integration',
        logoUrl: source.logoUrl,
        description: null,
        lastSyncAt: source.lastSyncAt,
        connectionId: source.connectionId,
        checkIds: [source.checkId],
      });
    }
    return [
      {
        key: 'compai',
        name: 'Comp AI',
        kind: 'platform',
        logoUrl: null,
        description: 'Members of this organization and their Comp AI roles',
        lastSyncAt: null,
      },
      ...integrations.values(),
      ...manual.map((m) => ({
        key: `manual:${m.id}`,
        name: m.name,
        kind: 'manual' as const,
        logoUrl: null,
        description: m.description,
        lastSyncAt: m.importedAt?.toISOString() ?? null,
        manualId: m.id,
        importedAt: m.importedAt,
        allowedAccountTypes: AllowedAccountTypesSchema.parse(m.allowedAccountTypes ?? {}),
      })),
    ];
  }

  private async loadAccounts({
    organizationId,
    system,
  }: {
    organizationId: string;
    system: SystemSource;
  }): Promise<BaseAccount[]> {
    if (system.kind === 'platform')
      return this.loadPlatformAccounts(organizationId);
    if (system.kind === 'manual' && system.manualId) {
      const rows = await db.accessSystemAccount.findMany({
        where: { systemId: system.manualId, system: { organizationId } },
        orderBy: { externalId: 'asc' },
      });
      return rows.map((r) => ({
        accountId: r.externalId,
        name: r.name ?? r.externalId,
        email: r.email?.toLowerCase() ?? null,
        type: r.type,
        status: r.status ?? 'active',
        roles: r.roles,
        isAdmin: r.isAdmin,
        mfaEnabled: r.mfaEnabled,
        lastLoginAt: r.lastLoginAt,
        // No creation date in the export: the import date starts the 90-day no-activity clock.
        accountCreatedAt: r.accountCreatedAt ?? system.importedAt ?? null,
      }));
    }
    const { connectionId, checkIds = [] } = system;
    if (!connectionId) return [];
    const results = await Promise.all(
      checkIds.map((checkId) =>
        this.checkResults.getLatestResultsByCheck({
          organizationId,
          connectionId,
          checkId,
          resourceType: 'user',
        }),
      ),
    );
    const byId = new Map<string, BaseAccount>();
    for (const row of results.flat())
      byId.set(row.resourceId, accountFromCheckRow(row));
    return [...byId.values()];
  }

  private async loadPlatformAccounts(
    organizationId: string,
  ): Promise<BaseAccount[]> {
    const members = await db.member.findMany({
      where: { organizationId },
      select: {
        role: true,
        deactivated: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
            lastLogin: true,
            // User.lastLogin is not always written; the newest session is the fallback.
            sessions: {
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => {
      const roles = m.role
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
      return {
        accountId: m.user.email.toLowerCase(),
        name: m.user.name || m.user.email,
        email: m.user.email.toLowerCase(),
        type: 'human',
        status: m.deactivated ? 'deactivated' : 'active',
        roles,
        isAdmin: roles.some((r) => PRIVILEGED_ROLES.has(r)),
        mfaEnabled: null,
        lastLoginAt: m.user.lastLogin ?? m.user.sessions[0]?.createdAt ?? null,
        accountCreatedAt: m.createdAt,
      };
    });
  }
}

/** For trigger jobs and exports, outside Nest's injector. */
export function createAccessAccountsService(): AccessAccountsService {
  return new AccessAccountsService(
    new CheckResultsService(new CheckRunRepository(), new ConnectionRepository()),
  );
}

function publicInfo(system: SystemSource): AccessSystemInfo {
  const { key, name, kind, logoUrl, description, lastSyncAt, allowedAccountTypes } = system;
  return { key, name, kind, logoUrl, description, lastSyncAt, ...(allowedAccountTypes && { allowedAccountTypes }) };
}
