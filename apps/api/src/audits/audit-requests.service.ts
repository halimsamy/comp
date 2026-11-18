import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { AuthContext } from '../auth/types';
import { parseDay } from '../attachments/attachment-validity';
import { AttachmentsService } from '../attachments/attachments.service';
import type { UploadAttachmentDto } from '../attachments/upload-attachment.dto';
import {
  assertAssignedAuditor,
  assertTeamMember,
  getVisibleAudit,
} from './audit-access';
import { AuditWorkspaceService } from './audit-workspace.service';
import type {
  CreateAuditRequestDto,
  DecideAuditRequestDto,
  RespondAuditRequestDto,
} from './dto/audit-workspace.dto';

/** Evidence requests: the auditor asks, the team answers with text and files. */
@Injectable()
export class AuditRequestsService {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly workspace: AuditWorkspaceService,
  ) {}

  async list({ auth, auditId }: { auth: AuthContext; auditId: string }) {
    const { organizationId } = auth;
    const audit = await getVisibleAudit({ auth, auditId });
    const requests = await db.auditEvidenceRequest.findMany({
      where: { auditId: audit.id },
      include: { requestedBy: { select: { user: { select: { name: true, email: true } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const files = await db.attachment.findMany({
      where: {
        organizationId,
        entityType: 'audit_request',
        entityId: { in: requests.map((r) => r.id) },
      },
      select: { id: true, name: true, entityId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return requests.map(({ requestedBy, ...request }) => ({
      ...request,
      requestedBy: requestedBy?.user ?? null,
      attachments: files
        .filter((f) => f.entityId === request.id)
        .map(({ id, name, createdAt }) => ({ id, name, createdAt })),
    }));
  }

  async create({
    auth,
    auditId,
    dto,
  }: {
    auth: AuthContext;
    auditId: string;
    dto: CreateAuditRequestDto;
  }) {
    const audit = await getVisibleAudit({ auth, auditId });
    const memberId = assertAssignedAuditor({ audit, auth });
    if (dto.requirementId) {
      await this.workspace.assertRequirement({
        auth,
        frameworkInstanceId: audit.frameworkInstanceId,
        requirementId: dto.requirementId,
      });
    }
    return db.$transaction(async (tx) => {
      const request = await tx.auditEvidenceRequest.create({
        data: {
          auditId: audit.id,
          requirementId: dto.requirementId ?? null,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          dueDate: dto.dueDate ? parseDay(dto.dueDate, 'dueDate') : null,
          requestedById: memberId,
        },
      });
      // A request on a requirement marks it "requested" in the workspace.
      if (dto.requirementId) {
        const review = { status: 'requested' as const, reviewedById: memberId, reviewedAt: new Date() };
        await tx.auditRequirementReview.upsert({
          where: {
            auditId_requirementId: { auditId: audit.id, requirementId: dto.requirementId },
          },
          create: { auditId: audit.id, requirementId: dto.requirementId, ...review },
          update: review,
        });
      }
      return request;
    });
  }

  async respond({
    auth,
    auditId,
    requestId,
    dto,
  }: {
    auth: AuthContext;
    auditId: string;
    requestId: string;
    dto: RespondAuditRequestDto;
  }) {
    assertTeamMember(auth);
    const request = await this.findRequest({ auth, auditId, requestId });
    return db.auditEvidenceRequest.update({
      where: { id: request.id },
      data: { response: dto.response.trim(), status: 'submitted', respondedAt: new Date() },
    });
  }

  async decide({
    auth,
    auditId,
    requestId,
    dto,
  }: {
    auth: AuthContext;
    auditId: string;
    requestId: string;
    dto: DecideAuditRequestDto;
  }) {
    const audit = await getVisibleAudit({ auth, auditId });
    assertAssignedAuditor({ audit, auth });
    const request = await this.findRequest({ auth, auditId, requestId });
    return db.auditEvidenceRequest.update({
      where: { id: request.id },
      data: { status: dto.status },
    });
  }

  async uploadFile({
    auth,
    auditId,
    requestId,
    dto,
    userId,
  }: {
    auth: AuthContext;
    auditId: string;
    requestId: string;
    dto: UploadAttachmentDto;
    userId: string;
  }) {
    assertTeamMember(auth);
    const request = await this.findRequest({ auth, auditId, requestId });
    if (request.status === 'accepted') {
      throw new BadRequestException('This request is already accepted');
    }
    return this.attachments.uploadAttachment(
      auth.organizationId,
      request.id,
      'audit_request',
      dto,
      userId,
    );
  }

  private async findRequest({
    auth,
    auditId,
    requestId,
  }: {
    auth: AuthContext;
    auditId: string;
    requestId: string;
  }) {
    const audit = await getVisibleAudit({ auth, auditId });
    const request = await db.auditEvidenceRequest.findFirst({
      where: { id: requestId, auditId: audit.id },
    });
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }
}
