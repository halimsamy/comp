import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AttachmentEntityType, Prisma, db } from '@db';
import {
  AccessAccountsService,
  createAccessAccountsService,
} from '../access-reviews/access-accounts.service';
import { AttachmentsService } from '../attachments/attachments.service';
import {
  buildRevocationRows,
  loadRevocationEvidence,
  revocationKey,
  type RevocationRow,
} from './access-revocation-rows';

export const AUTO_REVOKED_NOTE = 'Confirmed by the access inventory: no active account left';

/**
 * Offboarding access removal (#82). The list comes from the leaver's accounts
 * in the access inventory (Comp AI, integrations, manual systems). Vendors are
 * only a fallback for systems that have no inventory, and are optional.
 * A system whose accounts are all gone or disabled is marked revoked by itself.
 */
@Injectable()
export class AccessRevocationService {
  private readonly logger = new Logger(AccessRevocationService.name);
  private readonly accounts: AccessAccountsService;

  constructor(
    private readonly attachmentsService: AttachmentsService,
    @Optional() accounts?: AccessAccountsService,
  ) {
    this.accounts = accounts ?? createAccessAccountsService();
  }

  async getAccessRevocations(organizationId: string, memberId: string) {
    const member = await db.member.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, offboardDate: true },
    });
    if (!member) throw new NotFoundException('Member not found in this organization');
    const rows = await this.syncFromInventory({ organizationId, memberId, offboarding: !!member.offboardDate });
    const required = rows.filter((r) => !r.optional);
    return {
      systems: required,
      vendors: rows.filter((r) => r.optional),
      totalSystems: required.length,
      revokedCount: required.filter((r) => r.revoked).length,
      stillActiveCount: required.filter((r) => r.stillActive).length,
    };
  }

  /**
   * For a leaver, inventory systems whose accounts are all gone or disabled are
   * recorded as revoked and the checklist item follows. Returns the current rows.
   */
  async syncFromInventory({
    organizationId,
    memberId,
    offboarding,
  }: {
    organizationId: string;
    memberId: string;
    offboarding: boolean;
  }): Promise<RevocationRow[]> {
    const rows = await this.loadRows({ organizationId, memberId });
    if (!offboarding) return rows;
    const gone = rows.filter((r) => !r.optional && !r.revoked && r.accounts.length > 0 && r.activeAccounts === 0);
    if (gone.length === 0) {
      await this.syncCompletion({ organizationId, memberId, rows });
      return rows;
    }
    await db.offboardingAccessRevocation.createMany({
      data: gone.map((r) => ({
        organizationId,
        memberId,
        systemKey: r.systemKey,
        systemName: r.name,
        notes: AUTO_REVOKED_NOTE,
      })),
      skipDuplicates: true,
    });
    const fresh = await this.loadRows({ organizationId, memberId });
    await this.syncCompletion({ organizationId, memberId, rows: fresh });
    return fresh;
  }

  async revokeSystemAccess({
    organizationId,
    memberId,
    systemKey: rawKey,
    revokedById,
    notes,
    evidence,
  }: {
    organizationId: string;
    memberId: string;
    systemKey: string;
    revokedById: string;
    notes?: string;
    evidence?: { fileName: string; fileType: string; fileData: string };
  }) {
    const systemKey = revocationKey(rawKey);
    const rows = await this.loadRows({ organizationId, memberId });
    const row = rows.find((r) => r.systemKey === systemKey);
    if (!row) throw new NotFoundException('System not found for this member');
    if (row.revoked) throw new BadRequestException('Access to this system is already revoked');
    let revocation: { id: string };
    try {
      revocation = await db.offboardingAccessRevocation.create({
        data: {
          organizationId,
          memberId,
          systemKey,
          systemName: row.name,
          vendorId: row.vendorId,
          revokedById,
          notes,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Access to this system is already revoked');
      }
      throw err;
    }
    if (evidence) {
      try {
        await this.attachmentsService.uploadAttachment(
          organizationId,
          revocation.id,
          AttachmentEntityType.offboarding_checklist,
          evidence,
          revokedById,
        );
      } catch (err) {
        await db.offboardingAccessRevocation.delete({ where: { id: revocation.id } });
        throw err;
      }
    }
    await this.syncCompletionSafely({ organizationId, memberId, completedById: revokedById });
    return revocation;
  }

  async undoRevocation({
    organizationId,
    memberId,
    systemKey,
  }: {
    organizationId: string;
    memberId: string;
    systemKey: string;
  }) {
    const revocation = await db.offboardingAccessRevocation.findFirst({
      where: { memberId, organizationId, systemKey: revocationKey(systemKey) },
    });
    if (!revocation) throw new NotFoundException('Revocation record not found');
    const attachments = await this.attachmentsService.getAttachments(
      organizationId,
      revocation.id,
      AttachmentEntityType.offboarding_checklist,
    );
    for (const attachment of attachments) {
      await this.attachmentsService.deleteAttachment(organizationId, attachment.id);
    }
    await db.offboardingAccessRevocation.delete({ where: { id: revocation.id } });
    await this.syncCompletionSafely({ organizationId, memberId });
    return { success: true };
  }

  /** Confirms every required (inventory) system at once; optional vendors stay as they are. */
  async revokeAll({
    organizationId,
    memberId,
    revokedById,
  }: {
    organizationId: string;
    memberId: string;
    revokedById: string;
  }) {
    const rows = await this.loadRows({ organizationId, memberId });
    const pending = rows.filter((r) => !r.optional && !r.revoked);
    if (pending.length > 0) {
      await db.offboardingAccessRevocation.createMany({
        data: pending.map((r) => ({
          organizationId,
          memberId,
          systemKey: r.systemKey,
          systemName: r.name,
          vendorId: r.vendorId,
          revokedById,
        })),
        skipDuplicates: true,
      });
    }
    await this.syncCompletionSafely({ organizationId, memberId, completedById: revokedById });
    return { confirmed: pending.length };
  }

  private async loadRows({
    organizationId,
    memberId,
  }: {
    organizationId: string;
    memberId: string;
  }): Promise<RevocationRow[]> {
    const [inventory, vendors, revocations] = await Promise.all([
      this.accounts.listAllAccounts(organizationId),
      db.vendor.findMany({
        where: {
          organizationId,
          archivedAt: null,
          category: { in: ['software_as_a_service', 'cloud', 'infrastructure'] },
        },
        select: { id: true, name: true, website: true, logoUrl: true },
        orderBy: { name: 'asc' },
      }),
      db.offboardingAccessRevocation.findMany({
        where: { organizationId, memberId },
        include: { revokedBy: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    const evidence = await loadRevocationEvidence({
      organizationId,
      revocationIds: revocations.map((r) => r.id),
      attachments: this.attachmentsService,
    });
    const accounts = inventory.flatMap(({ system, accounts: rows }) =>
      rows.filter((a) => a.owner?.memberId === memberId).map((a) => ({ ...a, system })),
    );
    return buildRevocationRows({
      accounts,
      inventoryNames: inventory.map((i) => i.system.name),
      vendors,
      revocations,
      evidence,
    });
  }

  private async syncCompletionSafely(params: {
    organizationId: string;
    memberId: string;
    completedById?: string;
  }) {
    try {
      await this.syncCompletion(params);
    } catch (err) {
      this.logger.warn(`Failed to sync access revocation completion for member ${params.memberId}`, err);
    }
  }

  /** "Revoke system access" is complete when every inventory system is revoked. */
  private async syncCompletion({
    organizationId,
    memberId,
    completedById,
    rows,
  }: {
    organizationId: string;
    memberId: string;
    completedById?: string;
    rows?: RevocationRow[];
  }) {
    const templateItem = await db.offboardingChecklistTemplate.findFirst({
      where: { organizationId, isAccessRevocation: true, isEnabled: true, kind: 'offboarding' },
    });
    if (!templateItem) return;
    const required = (rows ?? (await this.loadRows({ organizationId, memberId }))).filter((r) => !r.optional);
    // Nothing in the inventory: the item stays a manual confirmation.
    if (required.length === 0) return;
    const allRevoked = required.length > 0 && required.every((r) => r.revoked && !r.stillActive);
    const existing = await db.offboardingChecklistCompletion.findFirst({
      where: { organizationId, memberId, templateItemId: templateItem.id },
    });
    if (allRevoked && !existing) {
      await db.offboardingChecklistCompletion.create({
        data: {
          organizationId,
          memberId,
          templateItemId: templateItem.id,
          completedById: completedById ?? null,
          notes: completedById ? null : AUTO_REVOKED_NOTE,
        },
      });
    }
    if (!allRevoked && existing) {
      await db.offboardingChecklistCompletion.delete({ where: { id: existing.id } });
    }
  }
}
