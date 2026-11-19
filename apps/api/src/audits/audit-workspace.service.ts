import { BadRequestException, Injectable } from '@nestjs/common';
import { db, type EvidenceFormType } from '@db';
import { toExternalEvidenceFormType } from '@trycompai/company';
import type { AuthContext } from '../auth/types';
import { evidenceFormDefinitions } from '../evidence-forms/evidence-forms.definitions';
import { loadMappings } from '../tasks/evidence-export/framework-evidence-mappings';
import { planRequirementFolders } from '../tasks/evidence-export/framework-evidence-plan';
import { assertAssignedAuditor, getVisibleAudit } from './audit-access';
import { loadAuditEvidence } from './audit-evidence';
import { computeReadiness, readinessBlockers } from './audit-readiness';
import { auditFrameworkSelect, loadAuditRequirements } from './audit-scope';
import type { CreateAuditCommentDto, ReviewRequirementDto } from './dto/audit-workspace.dto';

const formInfo = (formType: EvidenceFormType) => {
  const external = toExternalEvidenceFormType(formType);
  return {
    // The app's /documents/[formType] route uses the external form type.
    slug: external ?? null,
    title: (external && evidenceFormDefinitions[external]?.title) || formType,
  };
};

const memberName = {
  select: { id: true, user: { select: { name: true, email: true } } },
} as const;

@Injectable()
export class AuditWorkspaceService {
  /** Every requirement of the audited framework with its evidence, readiness and assessment. */
  async listRequirements({ auth, auditId }: { auth: AuthContext; auditId: string }) {
    const { organizationId } = auth;
    const audit = await getVisibleAudit({ auth, auditId });
    const framework = await db.frameworkInstance.findFirstOrThrow({
      where: { id: audit.frameworkInstanceId, organizationId },
      select: auditFrameworkSelect,
    });
    const [{ requirements, notApplicable }, mappings, skippedForms, reviews, comments, requests] =
      await Promise.all([
        loadAuditRequirements({ organizationId, framework }),
        loadMappings(framework.id),
        db.evidenceFormSetting.findMany({
          where: { organizationId, isNotRelevant: true },
          select: { formType: true },
        }),
        db.auditRequirementReview.findMany({
          where: { auditId: audit.id },
          include: { reviewedBy: memberName },
        }),
        db.auditComment.groupBy({
          by: ['requirementId'],
          where: { auditId: audit.id },
          _count: { _all: true },
        }),
        db.auditEvidenceRequest.groupBy({
          by: ['requirementId'],
          where: { auditId: audit.id, status: { not: 'accepted' } },
          _count: { _all: true },
        }),
      ]);

    const skipped = new Set(skippedForms.map((s) => s.formType));
    const folders = planRequirementFolders({
      requirements,
      mappings: mappings.map((m) => ({
        ...m,
        control: { ...m.control, formTypes: m.control.formTypes.filter((t) => !skipped.has(t)) },
      })),
    });
    const evidence = await loadAuditEvidence({
      organizationId,
      period: { from: audit.periodStart, to: audit.periodEnd },
      taskIds: [...new Set(folders.flatMap((f) => f.taskIds))],
      policyIds: [...new Set(folders.flatMap((f) => f.policyIds))],
      formTypes: [...new Set(folders.flatMap((f) => f.formTypes))],
    });
    const reviewById = new Map(reviews.map((r) => [r.requirementId, r]));
    const commentCount = new Map(comments.map((c) => [c.requirementId, c._count._all]));
    const requestCount = new Map(requests.map((r) => [r.requirementId, r._count._all]));

    return folders.map(({ requirement, controlNames, taskIds, policyIds, formTypes }) => {
      const requirementEvidence = {
        tasks: taskIds.flatMap((id) => evidence.tasks.get(id) ?? []),
        policies: policyIds.flatMap((id) => evidence.policies.get(id) ?? []),
        documents: formTypes.map((formType) => ({
          formType,
          ...formInfo(formType),
          submissionsInPeriod: evidence.submissions.get(formType) ?? 0,
        })),
      };
      const review = reviewById.get(requirement.id);
      const applicable = !notApplicable.has(requirement.id);
      return {
        id: requirement.id,
        identifier: requirement.identifier,
        name: requirement.name,
        description: requirement.description,
        controls: controlNames,
        ...requirementEvidence,
        readiness: computeReadiness({ applicable, evidence: requirementEvidence }),
        blockedBy: applicable ? readinessBlockers(requirementEvidence) : [],
        review: review
          ? {
              status: review.status,
              note: review.note,
              reviewedAt: review.reviewedAt,
              reviewedBy: review.reviewedBy?.user ?? null,
            }
          : null,
        commentCount: commentCount.get(requirement.id) ?? 0,
        openRequestCount: requestCount.get(requirement.id) ?? 0,
      };
    });
  }

  async review({
    auth,
    auditId,
    requirementId,
    dto,
  }: {
    auth: AuthContext;
    auditId: string;
    requirementId: string;
    dto: ReviewRequirementDto;
  }) {
    const audit = await getVisibleAudit({ auth, auditId });
    const reviewerId = assertAssignedAuditor({ audit, auth });
    await this.assertRequirement({ auth, frameworkInstanceId: audit.frameworkInstanceId, requirementId });
    const data = {
      status: dto.status,
      note: dto.note?.trim() || null,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    };
    return db.auditRequirementReview.upsert({
      where: { auditId_requirementId: { auditId: audit.id, requirementId } },
      create: { auditId: audit.id, requirementId, ...data },
      update: data,
    });
  }

  async clearReview({
    auth,
    auditId,
    requirementId,
  }: {
    auth: AuthContext;
    auditId: string;
    requirementId: string;
  }) {
    const audit = await getVisibleAudit({ auth, auditId });
    assertAssignedAuditor({ audit, auth });
    await db.auditRequirementReview.deleteMany({ where: { auditId: audit.id, requirementId } });
    return { success: true };
  }

  async listComments({
    auth,
    auditId,
    requirementId,
  }: {
    auth: AuthContext;
    auditId: string;
    requirementId?: string;
  }) {
    const audit = await getVisibleAudit({ auth, auditId });
    const rows = await db.auditComment.findMany({
      where: { auditId: audit.id, ...(requirementId ? { requirementId } : {}) },
      include: { author: memberName },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      requirementId: c.requirementId,
      content: c.content,
      createdAt: c.createdAt,
      author: c.author?.user ?? null,
    }));
  }

  async addComment({
    auth,
    auditId,
    dto,
  }: {
    auth: AuthContext;
    auditId: string;
    dto: CreateAuditCommentDto;
  }) {
    const audit = await getVisibleAudit({ auth, auditId });
    if (!auth.memberId) throw new BadRequestException('Comments need a signed-in member');
    if (dto.requirementId) {
      await this.assertRequirement({
        auth,
        frameworkInstanceId: audit.frameworkInstanceId,
        requirementId: dto.requirementId,
      });
    }
    return db.auditComment.create({
      data: {
        auditId: audit.id,
        requirementId: dto.requirementId ?? null,
        authorId: auth.memberId,
        content: dto.content.trim(),
      },
    });
  }

  /** The requirement must belong to the audited framework. */
  async assertRequirement({
    auth,
    frameworkInstanceId,
    requirementId,
  }: {
    auth: AuthContext;
    frameworkInstanceId: string;
    requirementId: string;
  }): Promise<void> {
    const framework = await db.frameworkInstance.findFirstOrThrow({
      where: { id: frameworkInstanceId, organizationId: auth.organizationId },
      select: auditFrameworkSelect,
    });
    const { requirements } = await loadAuditRequirements({
      organizationId: auth.organizationId,
      framework,
    });
    if (!requirements.some((r) => r.id === requirementId)) {
      throw new BadRequestException('Requirement is not part of this audit');
    }
  }
}
