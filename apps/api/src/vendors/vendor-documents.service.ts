import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db, TaskItemStatus, type VendorDocumentType } from '@db';
import { tasks } from '@trycompai/jobs';
import { AttachmentsService } from '../attachments/attachments.service';
import { VENDOR_DOCUMENT_SUMMARY_TASK_ID } from '../trigger/vendor/vendor-document-summary/summary-schema';
import type {
  CreateVendorDocumentDto,
  UpdateVendorDocumentDto,
} from './dto/vendor-document.dto';
import {
  assuranceFromDocument,
  resolveDocumentExpiry,
  SUMMARIZABLE_DOCUMENT_TYPES,
} from './tpsp/vendor-assurance';
import { documentRenewalTitle } from './tpsp/vendor-reminders';
import { isExpiringSoon } from './tpsp/vendor-review-status';

const toDate = (value: string | null | undefined) =>
  value ? new Date(value) : null;

const DOCUMENT_INCLUDE = {
  attachment: { select: { name: true, type: true, createdAt: true } },
} as const;

@Injectable()
export class VendorDocumentsService {
  private readonly logger = new Logger(VendorDocumentsService.name);

  constructor(private readonly attachments: AttachmentsService) {}

  private async assertVendor({
    vendorId,
    organizationId,
  }: {
    vendorId: string;
    organizationId: string;
  }) {
    const vendor = await db.vendor.findFirst({
      where: { id: vendorId, organizationId },
      select: { id: true, assuranceExpiresAt: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async findDocument(params: {
    vendorId: string;
    documentId: string;
    organizationId: string;
  }) {
    const document = await db.vendorDocument.findFirst({
      where: {
        id: params.documentId,
        vendorId: params.vendorId,
        organizationId: params.organizationId,
      },
    });
    if (!document) throw new NotFoundException('Vendor document not found');
    return document;
  }

  /** Refresh the vendor's assurance fields when this document is newer. */
  private async syncAssurance(document: {
    vendorId: string;
    type: Parameters<typeof assuranceFromDocument>[0]['document']['type'];
    periodStart: Date | null;
    periodEnd: Date | null;
    expiresAt: Date | null;
  }) {
    const vendor = await db.vendor.findUniqueOrThrow({
      where: { id: document.vendorId },
      select: { assuranceExpiresAt: true },
    });
    const assurance = assuranceFromDocument({ document, vendor });
    if (!assurance) return;
    await db.vendor.update({
      where: { id: document.vendorId },
      data: assurance,
    });
  }

  /** A newer, non-expiring document of this type answers the open renewal reminder. */
  private async closeRenewalReminder(document: {
    organizationId: string;
    vendorId: string;
    type: VendorDocumentType;
    expiresAt: Date | null;
  }) {
    if (isExpiringSoon({ expiresAt: document.expiresAt })) return;
    await db.taskItem.updateMany({
      where: {
        organizationId: document.organizationId,
        entityId: document.vendorId,
        entityType: 'vendor',
        title: documentRenewalTitle(document.type),
        status: { notIn: [TaskItemStatus.done, TaskItemStatus.canceled] },
      },
      data: { status: TaskItemStatus.done },
    });
  }

  async list({
    vendorId,
    organizationId,
  }: {
    vendorId: string;
    organizationId: string;
  }) {
    await this.assertVendor({ vendorId, organizationId });
    const documents = await db.vendorDocument.findMany({
      where: { vendorId, organizationId },
      include: DOCUMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return documents.map((document) => ({
      ...document,
      expiringSoon: isExpiringSoon({ expiresAt: document.expiresAt, now }),
    }));
  }

  async create({
    vendorId,
    organizationId,
    dto,
    userId,
  }: {
    vendorId: string;
    organizationId: string;
    dto: CreateVendorDocumentDto;
    userId?: string;
  }) {
    await this.assertVendor({ vendorId, organizationId });
    const { type, name, periodStart, periodEnd, expiresAt, ...upload } = dto;
    const attachment = await this.attachments.uploadAttachment(
      organizationId,
      vendorId,
      'vendor',
      upload,
      userId,
    );
    const period = {
      periodStart: toDate(periodStart),
      periodEnd: toDate(periodEnd),
    };
    const document = await db.vendorDocument.create({
      data: {
        organizationId,
        vendorId,
        attachmentId: attachment.id,
        type,
        name: name ?? dto.fileName,
        ...period,
        expiresAt: resolveDocumentExpiry({
          type,
          periodEnd: period.periodEnd,
          expiresAt: toDate(expiresAt),
        }),
        uploadedById: userId ?? null,
      },
    });
    await this.syncAssurance(document);
    await this.closeRenewalReminder(document);
    // Claude reads PDFs and images natively; other formats are summarized on request only.
    const readable = /\.(pdf|png|jpe?g|webp)$/i.test(dto.fileName);
    if (!readable || !SUMMARIZABLE_DOCUMENT_TYPES.includes(type)) return document;
    try {
      return await this.summarize({
        vendorId,
        documentId: document.id,
        organizationId,
      });
    } catch (error) {
      // The upload succeeded; a queue failure must not report it as failed.
      this.logger.error(`Could not start AI summary for ${document.id}`, error);
      return db.vendorDocument.update({
        where: { id: document.id },
        data: { aiSummaryStatus: 'failed' },
      });
    }
  }

  async update({
    vendorId,
    documentId,
    organizationId,
    dto,
  }: {
    vendorId: string;
    documentId: string;
    organizationId: string;
    dto: UpdateVendorDocumentDto;
  }) {
    const existing = await this.findDocument({
      vendorId,
      documentId,
      organizationId,
    });
    const type = dto.type ?? existing.type;
    const periodStart =
      dto.periodStart === undefined
        ? existing.periodStart
        : toDate(dto.periodStart);
    const periodEnd =
      dto.periodEnd === undefined ? existing.periodEnd : toDate(dto.periodEnd);
    const expiresAt =
      dto.expiresAt === undefined
        ? existing.expiresAt
        : resolveDocumentExpiry({
            type,
            periodEnd,
            expiresAt: toDate(dto.expiresAt),
          });
    const document = await db.vendorDocument.update({
      where: { id: documentId },
      data: { type, name: dto.name, periodStart, periodEnd, expiresAt },
    });
    await this.syncAssurance(document);
    return document;
  }

  async remove(params: {
    vendorId: string;
    documentId: string;
    organizationId: string;
  }) {
    const document = await this.findDocument(params);
    // Deleting the attachment (S3 + row) cascades to the document row.
    await this.attachments.deleteAttachment(
      params.organizationId,
      document.attachmentId,
    );
    return { success: true, deletedDocumentId: document.id };
  }

  async getDownloadUrl(params: {
    vendorId: string;
    documentId: string;
    organizationId: string;
  }) {
    const document = await this.findDocument(params);
    return this.attachments.getAttachmentDownloadUrl(
      params.organizationId,
      document.attachmentId,
    );
  }

  async summarize(params: {
    vendorId: string;
    documentId: string;
    organizationId: string;
  }) {
    await this.findDocument(params);
    // Mark pending before queueing, so a fast job's "completed" is never overwritten.
    await db.vendorDocument.update({
      where: { id: params.documentId },
      data: { aiSummaryStatus: 'pending' },
    });
    const handle = await tasks.trigger(VENDOR_DOCUMENT_SUMMARY_TASK_ID, {
      documentId: params.documentId,
      organizationId: params.organizationId,
    });
    return db.vendorDocument.update({
      where: { id: params.documentId },
      data: { aiSummaryRunId: handle.id },
    });
  }
}
