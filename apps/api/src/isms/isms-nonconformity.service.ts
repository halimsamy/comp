import { Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { FindingStatus, IsmsAuditFindingStatus, Prisma } from '@db';
import type {
  CreateNonconformityDto,
  UpdateNonconformityDto,
} from './dto/nonconformity.dto';
import { lockDocument } from './utils/document-lock';
import { parseOptionalDate } from './utils/parse-optional-date';
import { resolveActiveMember } from './utils/resolve-active-member';

/** One row of the 10.2 register, whichever table it lives in. */
export interface NonconformityRow {
  id: string;
  kind: 'standalone' | 'audit_finding' | 'external_finding';
  reference: string;
  source: string;
  sourceRef: string | null;
  severity: string | null;
  description: string;
  rootCause: string | null;
  correctiveAction: string | null;
  ownerMemberId: string | null;
  dueDate: Date | null;
  status: IsmsAuditFindingStatus;
  closureEvidence: string | null;
  effectivenessReviewedAt: Date | null;
  effectivenessReviewedById: string | null;
  effectivenessNotes: string | null;
  createdAt: Date;
}

/** Auditor findings (Finding) on the register's open / in progress / closed scale. */
const FINDING_STATUS: Record<FindingStatus, IsmsAuditFindingStatus> = {
  open: 'open',
  needs_revision: 'open',
  ready_for_review: 'in_progress',
  closed: 'closed',
};

function trimOrNull(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : value?.trim() || null;
}

/**
 * Nonconformity & corrective action register (ISO 27001 10.2), the one issue
 * register (#171). Internal-audit nonconformities stay on IsmsAuditFinding (so
 * the 9.2 report keeps them) and auditor findings stay on Finding (so the
 * auditor's review workflow keeps them); both are listed here, read-only, next
 * to standalone ones raised from incidents, management reviews, monitoring,
 * complaints or an imported log.
 */
@Injectable()
export class IsmsNonconformityService {
  async list({ organizationId }: { organizationId: string }) {
    const [standalone, findings, auditorFindings] = await Promise.all([
      db.ismsNonconformity.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      db.ismsAuditFinding.findMany({
        where: {
          type: { in: ['nc_major', 'nc_minor'] },
          audit: { document: { organizationId, type: 'internal_audit' } },
        },
        include: { audit: { select: { reference: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      db.finding.findMany({
        where: { organizationId },
        select: {
          id: true,
          status: true,
          severity: true,
          content: true,
          createdAt: true,
          audit: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const rows: NonconformityRow[] = [
      ...standalone.map((row) => ({
        ...row,
        kind: 'standalone' as const,
        severity: null,
      })),
      ...findings.map((finding) => ({
        id: finding.id,
        kind: 'audit_finding' as const,
        reference: `${finding.audit.reference} ${finding.reference}`,
        source: 'internal_audit',
        sourceRef: finding.clauseOrControl,
        severity: finding.type === 'nc_major' ? 'major' : 'minor',
        description: finding.description,
        rootCause: finding.rootCause,
        correctiveAction: finding.correctiveAction,
        ownerMemberId: finding.ownerMemberId,
        dueDate: finding.dueDate,
        status: finding.status,
        closureEvidence: finding.closureEvidence,
        effectivenessReviewedAt: finding.effectivenessReviewedAt,
        effectivenessReviewedById: finding.effectivenessReviewedById,
        effectivenessNotes: finding.effectivenessNotes,
        createdAt: finding.createdAt,
      })),
      ...auditorFindings.map((finding) => ({
        id: finding.id,
        kind: 'external_finding' as const,
        reference: `FND-${finding.id.slice(-6).toUpperCase()}`,
        source: 'external_audit',
        sourceRef: finding.audit?.title ?? null,
        severity: finding.severity,
        description: finding.content,
        rootCause: null,
        correctiveAction: null,
        ownerMemberId: null,
        dueDate: null,
        status: FINDING_STATUS[finding.status],
        closureEvidence: null,
        effectivenessReviewedAt: null,
        effectivenessReviewedById: null,
        effectivenessNotes: null,
        createdAt: finding.createdAt,
      })),
    ];
    return { data: rows, count: rows.length };
  }

  async create({
    organizationId,
    dto,
  }: {
    organizationId: string;
    dto: CreateNonconformityDto;
  }) {
    const members = await this.resolveMembers({ organizationId, dto });
    return db.$transaction(async (tx) => {
      // Serialize reference allocation per organization.
      await lockDocument(tx, `isms_nc:${organizationId}`);
      return tx.ismsNonconformity.create({
        data: {
          organizationId,
          reference: await this.nextReference({ tx, organizationId }),
          source: dto.source,
          description: dto.description.trim(),
          sourceRef: trimOrNull(dto.sourceRef) ?? null,
          rootCause: trimOrNull(dto.rootCause) ?? null,
          correctiveAction: trimOrNull(dto.correctiveAction) ?? null,
          ownerMemberId: members.ownerMemberId ?? null,
          dueDate: parseOptionalDate(dto.dueDate) ?? null,
          status: dto.status ?? 'open',
          closureEvidence: trimOrNull(dto.closureEvidence) ?? null,
          effectivenessReviewedAt:
            parseOptionalDate(dto.effectivenessReviewedAt) ?? null,
          effectivenessReviewedById: members.effectivenessReviewedById ?? null,
          effectivenessNotes: trimOrNull(dto.effectivenessNotes) ?? null,
        },
      });
    });
  }

  /** Log many rows at once (an imported nonconformity log), numbered in order. */
  async importMany({
    organizationId,
    rows,
  }: {
    organizationId: string;
    rows: CreateNonconformityDto[];
  }) {
    const members = await Promise.all(
      rows.map((dto) => this.resolveMembers({ organizationId, dto })),
    );
    return db.$transaction(async (tx) => {
      await lockDocument(tx, `isms_nc:${organizationId}`);
      const start = await this.lastNumber({ tx, organizationId });
      const created = await tx.ismsNonconformity.createMany({
        data: rows.map((dto, index) => ({
          organizationId,
          reference: `NC-${String(start + index + 1).padStart(2, '0')}`,
          source: dto.source,
          description: dto.description.trim(),
          sourceRef: trimOrNull(dto.sourceRef) ?? null,
          rootCause: trimOrNull(dto.rootCause) ?? null,
          correctiveAction: trimOrNull(dto.correctiveAction) ?? null,
          ownerMemberId: members[index].ownerMemberId ?? null,
          dueDate: parseOptionalDate(dto.dueDate) ?? null,
          status: dto.status ?? 'open',
          closureEvidence: trimOrNull(dto.closureEvidence) ?? null,
        })),
      });
      return { count: created.count };
    });
  }

  async update({
    id,
    organizationId,
    dto,
  }: {
    id: string;
    organizationId: string;
    dto: UpdateNonconformityDto;
  }) {
    await this.requireRow({ id, organizationId });
    const members = await this.resolveMembers({ organizationId, dto });
    return db.ismsNonconformity.update({
      where: { id },
      data: {
        source: dto.source ?? undefined,
        description: dto.description?.trim() || undefined,
        sourceRef: trimOrNull(dto.sourceRef),
        rootCause: trimOrNull(dto.rootCause),
        correctiveAction: trimOrNull(dto.correctiveAction),
        ownerMemberId: members.ownerMemberId,
        dueDate: parseOptionalDate(dto.dueDate),
        status: dto.status ?? undefined,
        closureEvidence: trimOrNull(dto.closureEvidence),
        effectivenessReviewedAt: parseOptionalDate(dto.effectivenessReviewedAt),
        effectivenessReviewedById: members.effectivenessReviewedById,
        effectivenessNotes: trimOrNull(dto.effectivenessNotes),
      },
    });
  }

  async remove({ id, organizationId }: { id: string; organizationId: string }) {
    await this.requireRow({ id, organizationId });
    await db.ismsNonconformity.delete({ where: { id } });
    return { success: true };
  }

  private async resolveMembers({
    organizationId,
    dto,
  }: {
    organizationId: string;
    dto: UpdateNonconformityDto;
  }) {
    const [ownerMemberId, effectivenessReviewedById] = await Promise.all([
      resolveActiveMember({ memberId: dto.ownerMemberId, organizationId }),
      resolveActiveMember({
        memberId: dto.effectivenessReviewedById,
        organizationId,
      }),
    ]);
    return { ownerMemberId, effectivenessReviewedById };
  }

  /** "NC-NN": max + 1, so deleting an older row never reissues its number. */
  private async nextReference({
    tx,
    organizationId,
  }: {
    tx: Prisma.TransactionClient;
    organizationId: string;
  }): Promise<string> {
    const max = await this.lastNumber({ tx, organizationId });
    return `NC-${String(max + 1).padStart(2, '0')}`;
  }

  private async lastNumber({
    tx,
    organizationId,
  }: {
    tx: Prisma.TransactionClient;
    organizationId: string;
  }): Promise<number> {
    const existing = await tx.ismsNonconformity.findMany({
      where: { organizationId },
      select: { reference: true },
    });
    const max = existing.reduce((acc, row) => {
      const match = /^NC-(\d+)$/.exec(row.reference);
      return match ? Math.max(acc, Number.parseInt(match[1], 10)) : acc;
    }, 0);
    return max;
  }

  private async requireRow({ id, organizationId }: { id: string; organizationId: string }) {
    const row = await db.ismsNonconformity.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Nonconformity not found');
    return row;
  }
}
