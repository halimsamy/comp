import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db, TaskItemStatus } from '@db';
import { OwnershipNotifier } from '../notifications/ownership-notifier.service';
import { isMemberOrgParticipant } from '../utils/org-participation';
import type { BulkVendorUpdateItemDto } from './dto/bulk-update-vendors.dto';
import {
  ARCHIVE_OR_RENEW_TASK_TITLE,
  CONTRACT_RENEWAL_TASK_TITLE,
  VENDOR_REVIEW_TASK_TITLE,
} from './tpsp/vendor-reminders';
import {
  responsibilityMatrixUpdate,
  tpspDateUpdate,
} from './tpsp/vendor-tpsp-update';

/** Register-wide vendor writes: bulk classification / import and archiving. */
@Injectable()
export class VendorRegisterService {
  constructor(private readonly owners: OwnershipNotifier) {}

  /**
   * Applies per-vendor TPSP field and owner changes in one transaction (the
   * "Classify vendors" review, bulk owner/criticality and the CSV import).
   */
  async bulkUpdate({
    organizationId,
    updates,
    actorUserId,
  }: {
    organizationId: string;
    updates: BulkVendorUpdateItemDto[];
    actorUserId?: string;
  }) {
    const ids = [...new Set(updates.map((u) => u.id))];
    const vendors = await db.vendor.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, name: true, assigneeId: true },
    });
    if (vendors.length !== ids.length) {
      throw new NotFoundException('One or more vendors were not found');
    }
    await this.assertAssignees({ organizationId, updates });

    await db.$transaction(
      updates.map(({ id, assigneeId, responsibilityMatrix, ...fields }) =>
        db.vendor.update({
          where: { id },
          data: {
            ...fields,
            ...tpspDateUpdate(fields),
            ...responsibilityMatrixUpdate(responsibilityMatrix),
            ...(assigneeId !== undefined && { assigneeId }),
          },
        }),
      ),
    );

    const before = new Map(vendors.map((v) => [v.id, v]));
    for (const { id, assigneeId } of updates) {
      const vendor = before.get(id);
      if (!vendor || !assigneeId || assigneeId === vendor.assigneeId) continue;
      void this.owners.notify({
        organizationId,
        memberId: assigneeId,
        entityType: 'vendor',
        entityName: vendor.name,
        url: `/vendors/${id}`,
        assignedByUserId: actorUserId,
      });
    }
    return { updated: updates.length };
  }

  /**
   * Archives a vendor whose relationship ended. It leaves the current register,
   * reminders, the attention rule and the trust portal; history is kept.
   */
  async archive({
    vendorId,
    organizationId,
    reason,
  }: {
    vendorId: string;
    organizationId: string;
    reason?: string;
  }) {
    await this.assertVendor({ vendorId, organizationId });
    const [vendor] = await db.$transaction([
      db.vendor.update({
        where: { id: vendorId },
        data: { archivedAt: new Date(), archiveReason: reason?.trim() || null },
      }),
      db.taskItem.updateMany({
        where: {
          organizationId,
          entityId: vendorId,
          entityType: 'vendor',
          status: { notIn: [TaskItemStatus.done, TaskItemStatus.canceled] },
          OR: [
            {
              title: {
                in: [
                  VENDOR_REVIEW_TASK_TITLE,
                  CONTRACT_RENEWAL_TASK_TITLE,
                  ARCHIVE_OR_RENEW_TASK_TITLE,
                ],
              },
            },
            { title: { startsWith: 'Request an updated ' } },
          ],
        },
        data: { status: TaskItemStatus.canceled },
      }),
    ]);
    return vendor;
  }

  async unarchive({
    vendorId,
    organizationId,
  }: {
    vendorId: string;
    organizationId: string;
  }) {
    await this.assertVendor({ vendorId, organizationId });
    return db.vendor.update({
      where: { id: vendorId },
      data: { archivedAt: null, archiveReason: null },
    });
  }

  private async assertVendor({
    vendorId,
    organizationId,
  }: {
    vendorId: string;
    organizationId: string;
  }) {
    const vendor = await db.vendor.findFirst({
      where: { id: vendorId, organizationId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
  }

  private async assertAssignees({
    organizationId,
    updates,
  }: {
    organizationId: string;
    updates: BulkVendorUpdateItemDto[];
  }) {
    const assigneeIds = [
      ...new Set(
        updates
          .map((u) => u.assigneeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (assigneeIds.length === 0) return;
    const members = await db.member.findMany({
      where: { id: { in: assigneeIds }, organizationId, deactivated: false },
      select: { id: true, user: { select: { role: true } } },
    });
    if (members.length !== assigneeIds.length) {
      throw new BadRequestException(
        'Owner is not an active member of this organization',
      );
    }
    for (const member of members) {
      if (!(await isMemberOrgParticipant(member.user.role, organizationId))) {
        throw new BadRequestException('Cannot assign a platform admin as owner');
      }
    }
  }
}
