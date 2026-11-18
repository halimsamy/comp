import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import { loadRequirementDefinitions } from '../frameworks-requirements.helper';
import { applicabilitySelect } from '../scoring/requirement-scoring';
import { applicabilityRules } from './applicability-rules';
import type { SetRequirementApplicabilityDto } from './dto/set-requirement-applicability.dto';

@Injectable()
export class RequirementApplicabilityService {
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
    dto,
  }: {
    organizationId: string;
    frameworkInstanceId: string;
    requirementKey: string;
    memberId: string | null;
    dto: SetRequirementApplicabilityDto;
  }) {
    const fi = await this.findInstance({ organizationId, frameworkInstanceId });
    const requirement = (await loadRequirementDefinitions(fi)).find((r) => r.id === requirementKey);
    if (!requirement) throw new NotFoundException('Requirement not found');

    const rules = applicabilityRules({
      frameworkName: fi.framework?.name ?? fi.customFramework?.name,
      requirementIdentifier: requirement.identifier,
    });
    if (!rules.editable) throw new BadRequestException(rules.reason);
    if (!rules.allowedStatuses.includes(dto.status)) {
      throw new BadRequestException(`"${dto.status}" is not allowed for this framework`);
    }
    const justification = dto.justification?.trim() || null;
    if (dto.status !== 'applicable' && !justification) {
      throw new BadRequestException('A justification is required unless the requirement is applicable');
    }

    const data = { status: dto.status, justification, source: 'manual' as const, updatedById: memberId };
    return db.requirementApplicability.upsert({
      where: { frameworkInstanceId_requirementKey: { frameworkInstanceId, requirementKey } },
      create: { organizationId, frameworkInstanceId, requirementKey, ...data },
      update: data,
      select: applicabilitySelect,
    });
  }
}
