import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttachmentEntityType, type ChecklistKind, db } from '@db';
import { AttachmentsService } from '../attachments/attachments.service';
import {
  loadMemberChecklist,
  pendingOffboardings,
  seedChecklistDefaults,
} from './member-checklist';

interface CompleteChecklistItemDto {
  notes?: string;
  fileName?: string;
  fileType?: string;
  fileData?: string;
  s3Key?: string;
}

interface UploadEvidenceDto {
  fileName: string;
  fileType: string;
  // Either inline base64 (UI/direct) or a presigned-upload s3Key (AI/MCP).
  fileData?: string;
  s3Key?: string;
  description?: string;
}

@Injectable()
export class OffboardingChecklistService {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  async getTemplate(
    organizationId: string,
    kind: ChecklistKind = 'offboarding',
  ) {
    await seedChecklistDefaults(organizationId, kind);

    return db.offboardingChecklistTemplate.findMany({
      where: { organizationId, kind },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createTemplateItem(
    organizationId: string,
    dto: {
      title: string;
      description?: string;
      evidenceRequired?: boolean;
      dueDays?: number;
      autoCompleteSource?: string;
      appliesToRoles?: string[];
      appliesToDepartments?: string[];
    },
    kind: ChecklistKind = 'offboarding',
  ) {
    const maxSortOrder = await db.offboardingChecklistTemplate.aggregate({
      where: { organizationId, kind },
      _max: { sortOrder: true },
    });

    return db.offboardingChecklistTemplate.create({
      data: {
        organizationId,
        title: dto.title,
        description: dto.description,
        evidenceRequired: dto.evidenceRequired ?? false,
        dueDays: dto.dueDays,
        autoCompleteSource: dto.autoCompleteSource,
        appliesToRoles: dto.appliesToRoles ?? [],
        appliesToDepartments: dto.appliesToDepartments ?? [],
        kind,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
        isDefault: false,
        isEnabled: true,
      },
    });
  }

  async updateTemplateItem(
    organizationId: string,
    templateItemId: string,
    dto: {
      title?: string;
      description?: string;
      evidenceRequired?: boolean;
      sortOrder?: number;
      isEnabled?: boolean;
      dueDays?: number | null;
      autoCompleteSource?: string | null;
      appliesToRoles?: string[];
      appliesToDepartments?: string[];
    },
  ) {
    const item = await db.offboardingChecklistTemplate.findFirst({
      where: { id: templateItemId, organizationId },
    });

    if (!item) {
      throw new NotFoundException('Template item not found');
    }

    return db.offboardingChecklistTemplate.update({
      where: { id: templateItemId },
      data: dto,
    });
  }

  async deleteTemplateItem(organizationId: string, templateItemId: string) {
    const item = await db.offboardingChecklistTemplate.findFirst({
      where: { id: templateItemId, organizationId },
    });

    if (!item) {
      throw new NotFoundException('Template item not found');
    }

    if (item.isDefault) {
      return db.offboardingChecklistTemplate.update({
        where: { id: templateItemId },
        data: { isEnabled: false },
      });
    }

    return db.offboardingChecklistTemplate.delete({
      where: { id: templateItemId },
    });
  }

  getMemberChecklist(
    organizationId: string,
    memberId: string,
    kind: ChecklistKind = 'offboarding',
  ) {
    return loadMemberChecklist({
      organizationId,
      memberId,
      kind,
      attachments: this.attachmentsService,
    });
  }

  getPendingOffboardings(organizationId: string) {
    return pendingOffboardings(organizationId);
  }

  async completeItem({
    organizationId,
    memberId,
    templateItemId,
    completedById,
    dto,
  }: {
    organizationId: string;
    memberId: string;
    templateItemId: string;
    completedById: string;
    dto: CompleteChecklistItemDto;
  }) {
    const existing = await db.offboardingChecklistCompletion.findFirst({
      where: { organizationId, memberId, templateItemId },
    });

    if (existing) {
      throw new BadRequestException('Item is already completed');
    }

    const template = await db.offboardingChecklistTemplate.findFirst({
      where: { id: templateItemId, organizationId, isEnabled: true },
    });

    if (!template) {
      throw new NotFoundException('Template item not found');
    }

    // Evidence can arrive as inline base64 (fileData) or a presigned-upload
    // s3Key (AI/MCP clients — avoids slow base64 through an LLM).
    const hasEvidenceFile = Boolean(dto.fileData || dto.s3Key);

    if (
      template.evidenceRequired &&
      (!hasEvidenceFile || !dto.fileName || !dto.fileType)
    ) {
      throw new BadRequestException('Evidence is required to complete this item');
    }

    const completion = await db.offboardingChecklistCompletion.create({
      data: {
        organizationId,
        memberId,
        templateItemId,
        completedById,
        notes: dto.notes,
      },
    });

    if (dto.fileName && hasEvidenceFile && dto.fileType) {
      try {
        // AttachmentsService.uploadAttachment resolves the bytes from whichever
        // of fileData / s3Key is provided.
        await this.attachmentsService.uploadAttachment(
          organizationId,
          completion.id,
          AttachmentEntityType.offboarding_checklist,
          {
            fileName: dto.fileName,
            fileData: dto.fileData,
            s3Key: dto.s3Key,
            fileType: dto.fileType,
          },
          completedById,
        );
      } catch (err) {
        await db.offboardingChecklistCompletion.delete({
          where: { id: completion.id },
        });
        throw err;
      }
    }

    return completion;
  }

  async uncompleteItem({
    organizationId,
    memberId,
    templateItemId,
  }: {
    organizationId: string;
    memberId: string;
    templateItemId: string;
  }) {
    const completion = await db.offboardingChecklistCompletion.findFirst({
      where: { organizationId, memberId, templateItemId },
    });

    if (!completion) {
      throw new NotFoundException('Completion not found');
    }

    const attachments = await this.attachmentsService.getAttachments(
      organizationId,
      completion.id,
      AttachmentEntityType.offboarding_checklist,
    );

    for (const attachment of attachments) {
      await this.attachmentsService.deleteAttachment(
        organizationId,
        attachment.id,
      );
    }

    await db.offboardingChecklistCompletion.delete({
      where: { id: completion.id },
    });
  }

  async uploadEvidenceToCompletion({
    organizationId,
    memberId,
    templateItemId,
    uploadDto,
    userId,
  }: {
    organizationId: string;
    memberId: string;
    templateItemId: string;
    uploadDto: UploadEvidenceDto;
    userId: string;
  }) {
    const completion = await db.offboardingChecklistCompletion.findFirst({
      where: { organizationId, memberId, templateItemId },
    });

    if (!completion) {
      throw new BadRequestException(
        'Item must be completed before uploading evidence',
      );
    }

    return this.attachmentsService.uploadAttachment(
      organizationId,
      completion.id,
      AttachmentEntityType.offboarding_checklist,
      uploadDto,
      userId,
    );
  }

}
