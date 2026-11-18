import { BadRequestException, Injectable } from '@nestjs/common';
import { db } from '@db';
import type { AuthContext } from '../auth/types';
import { parseDay } from '../attachments/attachment-validity';
import { getVisibleAudit, visibleAuditsWhere } from './audit-access';
import { summarizeProgress } from './audit-readiness';
import {
  auditFrameworkSelect,
  frameworkName,
  inScopeRequirementIds,
  loadAuditRequirements,
} from './audit-scope';
import type { CreateAuditDto, UpdateAuditDto } from './dto/audits.dto';

const auditInclude = {
  frameworkInstance: { select: auditFrameworkSelect },
  auditors: {
    select: {
      memberId: true,
      member: { select: { user: { select: { name: true, email: true, image: true } } } },
    },
  },
  reviews: { select: { requirementId: true, status: true } },
  requests: { select: { status: true } },
} as const;

/** Inclusive last day of a YYYY-MM-DD period. */
const endOfDay = (value: string, field: string) =>
  new Date(parseDay(value, field).getTime() + 24 * 60 * 60 * 1000 - 1);

@Injectable()
export class AuditsService {
  async list(auth: AuthContext) {
    const audits = await db.auditEngagement.findMany({
      where: visibleAuditsWhere(auth),
      include: auditInclude,
      orderBy: { periodEnd: 'desc' },
    });
    // One requirement load per framework, shared by its audits.
    const scopes = new Map<string, Promise<string[]>>();
    const scopeFor = (fi: (typeof audits)[number]['frameworkInstance']) => {
      let scope = scopes.get(fi.id);
      if (!scope) {
        scope = loadAuditRequirements({
          organizationId: auth.organizationId,
          framework: fi,
        }).then(inScopeRequirementIds);
        scopes.set(fi.id, scope);
      }
      return scope;
    };
    return Promise.all(
      audits.map(async (audit) =>
        this.toView({ audit, requirementIds: await scopeFor(audit.frameworkInstance), auth }),
      ),
    );
  }

  async get({ auth, auditId }: { auth: AuthContext; auditId: string }) {
    await getVisibleAudit({ auth, auditId });
    const audit = await db.auditEngagement.findFirstOrThrow({
      where: { id: auditId, organizationId: auth.organizationId },
      include: auditInclude,
    });
    const scope = await loadAuditRequirements({
      organizationId: auth.organizationId,
      framework: audit.frameworkInstance,
    });
    return this.toView({ audit, requirementIds: inScopeRequirementIds(scope), auth });
  }

  async create({ auth, dto }: { auth: AuthContext; dto: CreateAuditDto }) {
    const { organizationId } = auth;
    const fi = await db.frameworkInstance.findFirst({
      where: { id: dto.frameworkInstanceId, organizationId },
      select: { id: true },
    });
    if (!fi) throw new BadRequestException('Framework not found');
    const periodStart = parseDay(dto.periodStart, 'periodStart');
    const periodEnd = endOfDay(dto.periodEnd, 'periodEnd');
    if (periodEnd < periodStart) {
      throw new BadRequestException('The audit period must start before it ends');
    }
    const auditorIds = await this.validateAuditors({
      organizationId,
      memberIds: dto.auditorMemberIds ?? [],
    });

    const audit = await db.auditEngagement.create({
      data: {
        organizationId,
        frameworkInstanceId: fi.id,
        title: dto.title.trim(),
        firmName: dto.firmName?.trim() || null,
        periodStart,
        periodEnd,
        accessEndsAt: dto.accessEndsAt ? endOfDay(dto.accessEndsAt, 'accessEndsAt') : null,
        auditors: { create: auditorIds.map((memberId) => ({ memberId })) },
      },
    });
    return this.get({ auth, auditId: audit.id });
  }

  async update({
    auth,
    auditId,
    dto,
  }: {
    auth: AuthContext;
    auditId: string;
    dto: UpdateAuditDto;
  }) {
    const { organizationId } = auth;
    const audit = await getVisibleAudit({ auth, auditId });
    const periodStart = dto.periodStart
      ? parseDay(dto.periodStart, 'periodStart')
      : audit.periodStart;
    const periodEnd = dto.periodEnd ? endOfDay(dto.periodEnd, 'periodEnd') : audit.periodEnd;
    if (periodEnd < periodStart) {
      throw new BadRequestException('The audit period must start before it ends');
    }
    const auditorIds = dto.auditorMemberIds
      ? await this.validateAuditors({ organizationId, memberIds: dto.auditorMemberIds })
      : null;

    await db.$transaction(async (tx) => {
      await tx.auditEngagement.update({
        where: { id: audit.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.firmName !== undefined ? { firmName: dto.firmName?.trim() || null } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          periodStart,
          periodEnd,
          ...(dto.accessEndsAt !== undefined
            ? {
                accessEndsAt: dto.accessEndsAt
                  ? endOfDay(dto.accessEndsAt, 'accessEndsAt')
                  : null,
              }
            : {}),
        },
      });
      if (!auditorIds) return;
      await tx.auditEngagementAuditor.deleteMany({
        where: { auditId: audit.id, memberId: { notIn: auditorIds } },
      });
      await tx.auditEngagementAuditor.createMany({
        data: auditorIds.map((memberId) => ({ auditId: audit.id, memberId })),
        skipDuplicates: true,
      });
    });
    return this.get({ auth, auditId });
  }

  async remove({ auth, auditId }: { auth: AuthContext; auditId: string }) {
    const audit = await getVisibleAudit({ auth, auditId });
    await db.auditEngagement.delete({ where: { id: audit.id } });
    return { success: true };
  }

  /** Auditors must be active members of the org with the auditor role. */
  private async validateAuditors({
    organizationId,
    memberIds,
  }: {
    organizationId: string;
    memberIds: string[];
  }): Promise<string[]> {
    const ids = [...new Set(memberIds)];
    if (ids.length === 0) return [];
    const members = await db.member.findMany({
      where: { id: { in: ids }, organizationId, deactivated: false },
      select: { id: true, role: true },
    });
    const auditors = members.filter((m) =>
      m.role.split(',').some((role) => role.trim() === 'auditor'),
    );
    if (auditors.length !== ids.length) {
      throw new BadRequestException(
        'Auditors must be active members of the organization with the auditor role',
      );
    }
    return ids;
  }

  private toView({
    audit,
    requirementIds,
    auth,
  }: {
    audit: {
      id: string;
      title: string;
      firmName: string | null;
      status: string;
      periodStart: Date;
      periodEnd: Date;
      accessEndsAt: Date | null;
      createdAt: Date;
      frameworkInstance: Parameters<typeof frameworkName>[0];
      auditors: Array<{
        memberId: string;
        member: { user: { name: string | null; email: string; image: string | null } };
      }>;
      reviews: Parameters<typeof summarizeProgress>[0]['reviews'];
      requests: Array<{ status: string }>;
    };
    requirementIds: string[];
    auth: AuthContext;
  }) {
    return {
      id: audit.id,
      title: audit.title,
      firmName: audit.firmName,
      status: audit.status,
      periodStart: audit.periodStart,
      periodEnd: audit.periodEnd,
      accessEndsAt: audit.accessEndsAt,
      createdAt: audit.createdAt,
      frameworkInstanceId: audit.frameworkInstance.id,
      frameworkName: frameworkName(audit.frameworkInstance),
      auditors: audit.auditors.map((a) => ({ memberId: a.memberId, ...a.member.user })),
      progress: summarizeProgress({ requirementIds, reviews: audit.reviews }),
      openRequests: audit.requests.filter((r) => r.status !== 'accepted').length,
      // The caller is one of this audit's auditors (can assess and request evidence).
      viewerIsAuditor: audit.auditors.some((a) => a.memberId === auth.memberId),
    };
  }
}
