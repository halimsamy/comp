import { BadRequestException, Injectable } from '@nestjs/common';
import { db } from '@db';
import type { AuthContext } from '../auth/types';
import { parseDay } from '../attachments/attachment-validity';
import { OwnershipNotifier } from '../notifications/ownership-notifier.service';
import { assertTeamMember, getVisibleAudit } from './audit-access';
import { auditFrameworkSelect, loadAuditRequirements } from './audit-scope';
import type { TeamAuditRequestDto } from './dto/audit-workspace.dto';

/**
 * The team logs the auditor's request list (PBC list) received by email, one
 * request or a CSV of them (#109). Owners are told they now own the request.
 */
@Injectable()
export class AuditTeamRequestsService {
  constructor(private readonly ownership: OwnershipNotifier) {}

  async create({
    auth,
    auditId,
    requests,
  }: {
    auth: AuthContext;
    auditId: string;
    requests: TeamAuditRequestDto[];
  }) {
    assertTeamMember(auth);
    const { organizationId } = auth;
    const audit = await getVisibleAudit({ auth, auditId });
    await this.assertRequirements({ organizationId, audit, requests });
    await this.assertActiveOwners({ organizationId, requests });

    const data = requests.map((request) => ({
      auditId: audit.id,
      source: 'team' as const,
      requirementId: request.requirementId ?? null,
      title: request.title.trim(),
      description: request.description?.trim() || null,
      dueDate: request.dueDate ? parseDay(request.dueDate, 'dueDate') : null,
      ownerMemberId: request.ownerMemberId ?? null,
    }));
    const created = await db.auditEvidenceRequest.createMany({ data });

    await Promise.all(
      data.flatMap(({ ownerMemberId, title }) =>
        ownerMemberId
          ? [
              this.ownership.notify({
                organizationId,
                memberId: ownerMemberId,
                entityType: 'audit evidence request',
                entityName: title,
                url: `/audits/${audit.id}?tab=requests`,
                assignedByUserId: auth.userId ?? null,
              }),
            ]
          : [],
      ),
    );
    return { count: created.count };
  }

  private async assertRequirements({
    organizationId,
    audit,
    requests,
  }: {
    organizationId: string;
    audit: { frameworkInstanceId: string };
    requests: TeamAuditRequestDto[];
  }) {
    const ids = new Set(requests.flatMap((r) => (r.requirementId ? [r.requirementId] : [])));
    if (ids.size === 0) return;
    const framework = await db.frameworkInstance.findFirstOrThrow({
      where: { id: audit.frameworkInstanceId, organizationId },
      select: auditFrameworkSelect,
    });
    const { requirements } = await loadAuditRequirements({ organizationId, framework });
    const known = new Set(requirements.map((r) => r.id));
    if ([...ids].some((id) => !known.has(id))) {
      throw new BadRequestException('A request points to a requirement that is not part of this audit');
    }
  }

  /** Owners must be active members of the organization. */
  private async assertActiveOwners({
    organizationId,
    requests,
  }: {
    organizationId: string;
    requests: TeamAuditRequestDto[];
  }): Promise<void> {
    const ids = [...new Set(requests.flatMap((r) => (r.ownerMemberId ? [r.ownerMemberId] : [])))];
    if (ids.length === 0) return;
    const members = await db.member.findMany({
      where: { id: { in: ids }, organizationId, deactivated: false },
      select: { id: true },
    });
    if (members.length !== ids.length) {
      throw new BadRequestException('Request owners must be active members of the organization');
    }
  }
}
