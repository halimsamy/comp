import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { db } from '@db';
import type { Prisma } from '@db';
import { invalidateApprovalIfNeeded } from './utils/approval';
import { lockDocument } from './utils/document-lock';
import { parseOptionalDate } from './utils/parse-optional-date';
import { resolveActiveMember } from './utils/resolve-active-member';
import type {
  CreateRequirementInput,
  UpdateRequirementInput,
} from './registers/register-registry';

/**
 * CRUD for the Interested Parties Requirements & ISMS Treatment register (clauses
 * 4.2b/c). Derived rows are written by IsmsContextService.generate; this service
 * handles manual edits. Editing a derived row flips its source to 'manual'.
 */
@Injectable()
export class IsmsRequirementService {
  async create({
    documentId,
    organizationId,
    dto,
  }: {
    documentId: string;
    organizationId: string;
    dto: CreateRequirementInput;
  }) {
    await this.requireDocument({ documentId, organizationId });
    // Treat empty/whitespace as "no link" so a blank id can't skip validation
    // or be persisted as an invalid reference.
    const interestedPartyId = dto.interestedPartyId?.trim() || null;
    if (interestedPartyId) {
      await this.requirePartyInOrg({ interestedPartyId, organizationId });
    }
    const ownerMemberId = await resolveActiveMember({
      memberId: dto.ownerMemberId,
      organizationId,
    });
    const lastReviewedAt = parseOptionalDate(dto.lastReviewedAt);

    return db.$transaction(async (tx) => {
      await lockDocument(tx, documentId);
      const position =
        dto.position ?? (await this.nextPosition({ tx, documentId }));
      await invalidateApprovalIfNeeded({ tx, documentId });
      return tx.ismsInterestedPartyRequirement.create({
        data: {
          documentId,
          interestedPartyId,
          partyName: dto.partyName,
          requirement: dto.requirement,
          treatment: dto.treatment,
          ownerMemberId: ownerMemberId ?? null,
          lastReviewedAt: lastReviewedAt ?? null,
          source: 'manual',
          position,
        },
      });
    });
  }

  async update({
    requirementId,
    organizationId,
    dto,
  }: {
    requirementId: string;
    organizationId: string;
    dto: UpdateRequirementInput;
  }) {
    const requirement = await this.requireRequirement({
      requirementId,
      organizationId,
    });
    // undefined = field omitted (leave as-is); empty string = clear the link.
    const partyFieldProvided = dto.interestedPartyId !== undefined;
    const interestedPartyId = dto.interestedPartyId?.trim() || null;
    if (interestedPartyId) {
      await this.requirePartyInOrg({ interestedPartyId, organizationId });
    }
    const ownerMemberId = await resolveActiveMember({
      memberId: dto.ownerMemberId,
      organizationId,
    });

    return db.$transaction(async (tx) => {
      await invalidateApprovalIfNeeded({
        tx,
        documentId: requirement.documentId,
      });
      return tx.ismsInterestedPartyRequirement.update({
        where: { id: requirementId },
        data: {
          interestedPartyId: partyFieldProvided ? interestedPartyId : undefined,
          partyName: dto.partyName ?? undefined,
          requirement: dto.requirement ?? undefined,
          treatment: dto.treatment ?? undefined,
          ownerMemberId,
          lastReviewedAt: parseOptionalDate(dto.lastReviewedAt),
          position: dto.position ?? undefined,
          source: 'manual',
        },
      });
    });
  }

  async remove({
    requirementId,
    organizationId,
  }: {
    requirementId: string;
    organizationId: string;
  }) {
    const requirement = await this.requireRequirement({
      requirementId,
      organizationId,
    });
    await db.$transaction(async (tx) => {
      await invalidateApprovalIfNeeded({
        tx,
        documentId: requirement.documentId,
      });
      await tx.ismsInterestedPartyRequirement.delete({
        where: { id: requirementId },
      });
    });
    return { success: true };
  }

  /**
   * Next position uses max(position)+1 so it survives deletes. Runs on the
   * transaction client; the create first takes a per-document advisory lock
   * (lockDocument) so concurrent creates can't read the same max.
   */
  private async nextPosition({
    tx,
    documentId,
  }: {
    tx: Prisma.TransactionClient;
    documentId: string;
  }) {
    const last = await tx.ismsInterestedPartyRequirement.findFirst({
      where: { documentId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return (last?.position ?? -1) + 1;
  }

  /**
   * Ensures a linked party is in the org's 4.2a Interested Parties Register.
   * Parties live in that register, not in this (4.2b/c) requirements document.
   */
  private async requirePartyInOrg({
    interestedPartyId,
    organizationId,
  }: {
    interestedPartyId: string;
    organizationId: string;
  }) {
    const party = await db.ismsInterestedParty.findFirst({
      where: {
        id: interestedPartyId,
        document: { organizationId, type: 'interested_parties_register' },
      },
      select: { id: true },
    });
    if (!party) {
      throw new BadRequestException(
        'Interested party is not in this organization\'s Interested Parties Register',
      );
    }
    return party;
  }

  private async requireDocument({
    documentId,
    organizationId,
  }: {
    documentId: string;
    organizationId: string;
  }) {
    const document = await db.ismsDocument.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!document) {
      throw new NotFoundException('ISMS document not found');
    }
    return document;
  }

  private async requireRequirement({
    requirementId,
    organizationId,
  }: {
    requirementId: string;
    organizationId: string;
  }) {
    const requirement = await db.ismsInterestedPartyRequirement.findFirst({
      where: { id: requirementId, document: { organizationId } },
    });
    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }
    return requirement;
  }
}
