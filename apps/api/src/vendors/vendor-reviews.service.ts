import { Injectable, NotFoundException } from '@nestjs/common';
import { db, TaskItemStatus } from '@db';
import type { CreateVendorReviewDto } from './dto/vendor-review.dto';
import { addMonths, reviewCadenceMonths } from './tpsp/vendor-review-status';
import { VENDOR_REVIEW_TASK_TITLE } from './tpsp/vendor-reminders';

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
   * review date by its cadence, records the PCI status check (12.8.4) and
   * closes any open review reminder task.
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
        criticality: true,
        handlesCardholderData: true,
        affectsCdeSecurity: true,
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const now = new Date();
    const nextReviewDue = dto.nextReviewDue
      ? new Date(dto.nextReviewDue)
      : addMonths({ date: now, months: reviewCadenceMonths(vendor) });
    const { checklist } = dto;

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
          lastReviewedAt: now,
          nextReviewDue,
          ...(checklist.pciStatusConfirmed && { pciStatusCheckedAt: now }),
        },
      }),
      db.taskItem.updateMany({
        where: {
          organizationId,
          entityId: vendorId,
          entityType: 'vendor',
          title: VENDOR_REVIEW_TASK_TITLE,
          status: { notIn: [TaskItemStatus.done, TaskItemStatus.canceled] },
        },
        data: { status: TaskItemStatus.done },
      }),
    ]);
    return review;
  }
}
