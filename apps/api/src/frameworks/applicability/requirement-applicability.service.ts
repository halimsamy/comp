import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db, Prisma } from '@db';
import { writeSoaAnswerForAnnexA } from '../../soa/utils/soa-answer-writer';
import { loadRequirementDefinitions } from '../frameworks-requirements.helper';
import { applicabilitySelect } from '../scoring/requirement-scoring';
import { type ApplicabilityDetails, parseApplicabilityDetails } from './applicability-details';
import { applicabilityRules } from './applicability-rules';
import type { SetRequirementApplicabilityDto } from './dto/set-requirement-applicability.dto';

/** Sub-requirements by identifier prefix: 1.2 -> 1.2.1, 1.2.1.1 (not 1.20). */
export function findChildRequirements<T extends { id: string; identifier: string }>({
  requirements,
  parent,
}: {
  requirements: T[];
  parent: { id: string; identifier: string };
}): T[] {
  const prefix = parent.identifier.trim();
  if (!prefix) return [];
  return requirements.filter((r) => r.id !== parent.id && r.identifier.startsWith(`${prefix}.`));
}

@Injectable()
export class RequirementApplicabilityService {
  private readonly logger = new Logger(RequirementApplicabilityService.name);

  private async findInstance({
    organizationId,
    frameworkInstanceId,
  }: {
    organizationId: string;
    frameworkInstanceId: string;
  }) {
    const fi = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId },
      select: {
        id: true,
        frameworkId: true,
        customFrameworkId: true,
        currentVersionId: true,
        framework: { select: { name: true } },
        customFramework: { select: { name: true } },
      },
    });
    if (!fi) throw new NotFoundException('Framework instance not found');
    return fi;
  }

  async list({
    organizationId,
    frameworkInstanceId,
  }: {
    organizationId: string;
    frameworkInstanceId: string;
  }) {
    await this.findInstance({ organizationId, frameworkInstanceId });
    const data = await db.requirementApplicability.findMany({
      where: { organizationId, frameworkInstanceId },
      select: applicabilitySelect,
      orderBy: { updatedAt: 'desc' },
    });
    return { data, count: data.length };
  }

  async set({
    organizationId,
    frameworkInstanceId,
    requirementKey,
    memberId,
    userId,
    dto,
  }: {
    organizationId: string;
    frameworkInstanceId: string;
    requirementKey: string;
    memberId: string | null;
    userId?: string | null;
    dto: SetRequirementApplicabilityDto;
  }) {
    const fi = await this.findInstance({ organizationId, frameworkInstanceId });
    const requirements = await loadRequirementDefinitions(fi);
    const requirement = requirements.find((r) => r.id === requirementKey);
    if (!requirement) throw new NotFoundException('Requirement not found');

    const rules = applicabilityRules({
      frameworkName: fi.framework?.name ?? fi.customFramework?.name,
      requirementIdentifier: requirement.identifier,
    });
    if (!rules.editable) throw new BadRequestException(rules.reason);
    if (!rules.allowedStatuses.includes(dto.status)) {
      throw new BadRequestException(`"${dto.status}" is not allowed for this requirement`);
    }
    // Switching back to applicable clears the old justification and worksheet.
    const justification = dto.status === 'applicable' ? null : dto.justification?.trim() || null;
    if (dto.status !== 'applicable' && !justification) {
      throw new BadRequestException('A justification is required unless the requirement is applicable');
    }

    // ISO Annex A: the SoA row is the source of truth; its sync writes applicability.
    if (rules.managedBy === 'soa' && fi.frameworkId) {
      if (!userId) throw new BadRequestException('Sign in to change the Statement of Applicability');
      await writeSoaAnswerForAnnexA({
        organizationId,
        frameworkId: fi.frameworkId,
        identifier: requirement.identifier,
        isApplicable: dto.status === 'applicable',
        justification,
        userId,
        logger: {
          log: (msg, meta) => this.logger.log(msg, meta),
          error: (msg, meta) => this.logger.error(msg, meta),
        },
      });
      const record = await db.requirementApplicability.findFirst({
        where: { organizationId, frameworkInstanceId, requirementKey },
        select: applicabilitySelect,
      });
      return { ...record, cascaded: 0 };
    }

    const details = this.parseDetails({ status: dto.status, details: dto.details });
    await this.validateDetailRefs({ organizationId, details });

    const data = {
      status: dto.status,
      justification,
      details: details ?? Prisma.DbNull,
      source: 'manual' as const,
      updatedById: memberId,
    };
    const children =
      dto.status === 'not_applicable' && dto.applyToChildren
        ? findChildRequirements({ requirements, parent: requirement })
        : [];

    const [record] = await db.$transaction([
      db.requirementApplicability.upsert({
        where: { frameworkInstanceId_requirementKey: { frameworkInstanceId, requirementKey } },
        create: { organizationId, frameworkInstanceId, requirementKey, ...data },
        update: data,
        select: applicabilitySelect,
      }),
      ...children.map((child) => {
        const childData = {
          ...data,
          details: { kind: 'not_applicable', sourceRequirementId: requirementKey },
        };
        return db.requirementApplicability.upsert({
          where: {
            frameworkInstanceId_requirementKey: { frameworkInstanceId, requirementKey: child.id },
          },
          create: { organizationId, frameworkInstanceId, requirementKey: child.id, ...childData },
          update: childData,
          select: { id: true },
        });
      }),
    ]);
    return { ...record, cascaded: children.length };
  }

  private parseDetails({
    status,
    details,
  }: {
    status: SetRequirementApplicabilityDto['status'];
    details: unknown;
  }): ApplicabilityDetails | null {
    try {
      return parseApplicabilityDetails({ status, details });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid details');
    }
  }

  /** Worksheet references must point at this org's controls and TRA submissions. */
  private async validateDetailRefs({
    organizationId,
    details,
  }: {
    organizationId: string;
    details: ApplicabilityDetails | null;
  }) {
    if (details?.kind === 'compensating_control') {
      const ids = [...new Set(details.compensatingControlIds)];
      const found = await db.control.count({ where: { id: { in: ids }, organizationId } });
      if (found !== ids.length) throw new BadRequestException('Unknown compensating control');
    }
    if (details?.kind === 'customized_approach') {
      const tra = await db.evidenceSubmission.findFirst({
        where: {
          id: details.targetedRiskAnalysisSubmissionId,
          organizationId,
          formType: 'targeted_risk_analysis',
        },
        select: { id: true },
      });
      if (!tra) throw new BadRequestException('Targeted risk analysis submission not found');
    }
  }
}
