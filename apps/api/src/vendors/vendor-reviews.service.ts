import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db, TaskItemPriority, TaskItemStatus } from '@db';
import type { CreateVendorReviewDto } from './dto/vendor-review.dto';
import { addMonths, reviewCadenceMonths } from './tpsp/vendor-review-status';
import { VENDOR_REVIEW_TASK_TITLE } from './tpsp/vendor-reminders';
import {
  reviewSignOffError,
  VERIFY_RISK_ASSESSMENT_TASK_TITLE,
} from './tpsp/vendor-review-rules';

const DAY_MS = 86_400_000;
/** Conditions of an approval are due within this many days. */
const CONDITION_DUE_DAYS = 90;

@Injectable()
export class VendorReviewsService {
  async list({
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
    return db.vendorReview.findMany({
      where: { vendorId, organizationId },
      orderBy: { reviewedAt: 'desc' },
    });
  }

  /**
   * Signs off a periodic review: appends the review, moves the vendor's next
   * review date by its cadence, records the confirmed PCI status (12.8.4),
   * marks the vendor assessed, closes the open review reminder and "Verify risk
   * assessment" to-dos, and turns each condition into a vendor action.
   */
  async signOff({
    vendorId,
    organizationId,
    dto,
    userId,
  }: {
    vendorId: string;
    organizationId: string;
    dto: CreateVendorReviewDto;
    userId: string;
  }) {
    const vendor = await db.vendor.findFirst({
      where: { id: vendorId, organizationId },
      select: {
        id: true,
        assigneeId: true,
        criticality: true,
        handlesCardholderData: true,
        affectsCdeSecurity: true,
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const inPciScope = vendor.handlesCardholderData || vendor.affectsCdeSecurity;
    const error = reviewSignOffError({ input: dto, inPciScope });
    if (error) throw new BadRequestException(error);

    const [user, member, documents] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
      db.member.findFirst({
        where: { userId, organizationId },
        select: { id: true },
      }),
      dto.reviewedDocumentIds?.length
        ? db.vendorDocument.findMany({
            where: {
              id: { in: dto.reviewedDocumentIds },
              vendorId,
              organizationId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    const now = new Date();
    const nextReviewDue = dto.nextReviewDue
      ? new Date(dto.nextReviewDue)
      : addMonths({ date: now, months: reviewCadenceMonths(vendor) });
    const { checklist } = dto;
    const pciStatus = checklist.pciStatusConfirmed
      ? (dto.pciStatus ?? null)
      : null;
    const conditions =
      dto.outcome === 'approved_with_conditions'
        ? (dto.conditions ?? []).map((c) => c.trim()).filter(Boolean)
        : [];
    const creatorId = member?.id ?? vendor.assigneeId;

    const [review] = await db.$transaction([
      db.vendorReview.create({
        data: {
          organizationId,
          vendorId,
          outcome: dto.outcome,
          notes: dto.notes ?? null,
          checklist: {
            assuranceReviewed: checklist.assuranceReviewed,
            pciStatusConfirmed: checklist.pciStatusConfirmed,
            contractReviewed: checklist.contractReviewed,
            riskReassessed: checklist.riskReassessed,
          },
          pciStatus,
          reviewedDocumentIds: documents.map((doc) => doc.id),
          conditions,
          criticality: vendor.criticality,
          reviewedByUserId: userId,
          reviewedByName: user?.name || user?.email || 'Unknown',
          reviewedAt: now,
          nextReviewDue,
        },
      }),
      db.vendor.update({
        where: { id: vendorId },
        data: {
          status: 'assessed',
          lastReviewedAt: now,
          nextReviewDue,
          ...(pciStatus && { pciStatus, pciStatusCheckedAt: now }),
        },
      }),
      db.taskItem.updateMany({
        where: {
          organizationId,
          entityId: vendorId,
          entityType: 'vendor',
          title: {
            in: [VENDOR_REVIEW_TASK_TITLE, VERIFY_RISK_ASSESSMENT_TASK_TITLE],
          },
          status: { notIn: [TaskItemStatus.done, TaskItemStatus.canceled] },
        },
        data: { status: TaskItemStatus.done, completedAt: now },
      }),
      // Without a member to attribute them to (API key with no owner), the
      // conditions stay on the review record only.
      ...(creatorId && conditions.length
        ? [
            db.taskItem.createMany({
              data: conditions.map((condition) => ({
                title: condition.slice(0, 200),
                description: `Condition of the vendor review signed off on ${now.toISOString().slice(0, 10)}.`,
                status: TaskItemStatus.todo,
                priority: TaskItemPriority.medium,
                entityId: vendorId,
                entityType: 'vendor' as const,
                organizationId,
                createdById: creatorId,
                assigneeId: vendor.assigneeId,
                dueDate: new Date(now.getTime() + CONDITION_DUE_DAYS * DAY_MS),
              })),
            }),
          ]
        : []),
    ]);
    return review;
  }
}
