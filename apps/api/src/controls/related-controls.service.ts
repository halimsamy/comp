import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db, EvidenceFormType } from '@db';
import { ControlsService } from './controls.service';
import {
  controlSummarySelect,
  groupRequirementsByFramework,
  toOwner,
} from './control-requirements';

export const RELATED_ENTITY_TYPES = ['policy', 'task', 'evidence_form', 'isms_document'] as const;
export type RelatedEntityType = (typeof RELATED_ENTITY_TYPES)[number];

interface EntityRef {
  organizationId: string;
  entityType: RelatedEntityType;
  entityId: string;
}

/** controlId → framework instances the link counts for (`all` for a control-level link). */
type LinkScope = Map<string, Set<string> | 'all'>;

function addScope({ scope, controlId, frameworkInstanceId }: {
  scope: LinkScope;
  controlId: string;
  frameworkInstanceId?: string;
}) {
  const current = scope.get(controlId);
  if (current === 'all') return;
  if (!frameworkInstanceId) {
    scope.set(controlId, 'all');
    return;
  }
  scope.set(controlId, (current ?? new Set<string>()).add(frameworkInstanceId));
}

/** Accepts the enum key (`access_request`) or the URL form (`access-request`). */
function asFormType(value: string): EvidenceFormType {
  const key = value.replace(/-/g, '_');
  const match = Object.values(EvidenceFormType).find((formType) => formType === key);
  if (!match) throw new NotFoundException('evidence form not found');
  return match;
}

@Injectable()
export class RelatedControlsService {
  constructor(private readonly controlsService: ControlsService) {}

  async list(ref: EntityRef) {
    await this.ensureEntity(ref);
    const scope = await this.linkScope(ref);
    const controls = await db.control.findMany({
      where: { id: { in: [...scope.keys()] }, organizationId: ref.organizationId, archivedAt: null },
      select: controlSummarySelect,
      orderBy: { name: 'asc' },
    });

    const data = controls.map((control) => {
      const allowed = scope.get(control.id);
      return {
        id: control.id,
        name: control.name,
        description: control.description,
        owner: toOwner(control.owner),
        frameworks: groupRequirementsByFramework({
          requirementsMapped: control.requirementsMapped,
          onlyFrameworkInstanceIds: allowed === 'all' ? undefined : allowed,
        }),
      };
    });
    return { data, count: data.length };
  }

  async link({ controlIds, ...ref }: EntityRef & { controlIds: string[] }) {
    await this.ensureEntity(ref);
    const ids = [...new Set(controlIds)];
    const valid = await db.control.count({
      where: { id: { in: ids }, organizationId: ref.organizationId, archivedAt: null },
    });
    if (valid !== ids.length) throw new BadRequestException('One or more controls are invalid');

    const { organizationId, entityId } = ref;
    if (ref.entityType === 'isms_document') {
      await db.ismsDocumentControlLink.createMany({
        data: ids.map((controlId) => ({ ismsDocumentId: entityId, controlId })),
        skipDuplicates: true,
      });
      return { count: ids.length };
    }
    // Control-level links fan out to every framework that maps the control.
    for (const controlId of ids) {
      if (ref.entityType === 'policy') {
        await this.controlsService.linkPolicies(controlId, organizationId, [entityId]);
      } else if (ref.entityType === 'task') {
        await this.controlsService.linkTasks(controlId, organizationId, [entityId]);
      } else {
        await this.controlsService.linkDocumentTypes(controlId, organizationId, [
          asFormType(entityId),
        ]);
      }
    }
    return { count: ids.length };
  }

  async unlink({ controlId, ...ref }: EntityRef & { controlId: string }) {
    await this.ensureEntity(ref);
    const { organizationId, entityId } = ref;
    const control = await db.control.findFirst({
      where: { id: controlId, organizationId },
      select: { id: true },
    });
    if (!control) throw new NotFoundException('Control not found');

    // Unlinking from the evidence side removes the link for every framework.
    if (ref.entityType === 'policy') {
      await db.$transaction([
        db.policy.update({
          where: { id: entityId, organizationId },
          data: { controls: { disconnect: { id: controlId } } },
        }),
        db.frameworkControlPolicyLink.deleteMany({ where: { controlId, policyId: entityId } }),
      ]);
    } else if (ref.entityType === 'task') {
      await db.$transaction([
        db.task.update({
          where: { id: entityId, organizationId },
          data: { controls: { disconnect: { id: controlId } } },
        }),
        db.frameworkControlTaskLink.deleteMany({ where: { controlId, taskId: entityId } }),
      ]);
    } else if (ref.entityType === 'evidence_form') {
      await this.controlsService.unlinkDocumentType(
        controlId,
        organizationId,
        asFormType(entityId),
      );
    } else {
      await db.ismsDocumentControlLink.deleteMany({
        where: { ismsDocumentId: entityId, controlId },
      });
    }
    return { success: true };
  }

  private async ensureEntity({ organizationId, entityType, entityId }: EntityRef) {
    const where = { id: entityId, organizationId };
    const found =
      entityType === 'policy'
        ? await db.policy.findFirst({ where, select: { id: true } })
        : entityType === 'task'
          ? await db.task.findFirst({ where, select: { id: true } })
          : entityType === 'isms_document'
            ? await db.ismsDocument.findFirst({ where, select: { id: true } })
            : asFormType(entityId);
    if (!found) throw new NotFoundException(`${entityType.replace('_', ' ')} not found`);
  }

  private async linkScope({ organizationId, entityType, entityId }: EntityRef): Promise<LinkScope> {
    const scope: LinkScope = new Map();
    const inOrg = { organizationId };

    if (entityType === 'isms_document') {
      const links = await db.ismsDocumentControlLink.findMany({
        where: { ismsDocumentId: entityId, control: inOrg },
        select: { controlId: true },
      });
      for (const l of links) addScope({ scope, controlId: l.controlId });
      return scope;
    }

    const [direct, scoped] =
      entityType === 'policy'
        ? await Promise.all([
            db.control.findMany({ where: { ...inOrg, policies: { some: { id: entityId } } }, select: { id: true } }),
            db.frameworkControlPolicyLink.findMany({
              where: { policyId: entityId, control: inOrg },
              select: { controlId: true, frameworkInstanceId: true },
            }),
          ])
        : entityType === 'task'
          ? await Promise.all([
              db.control.findMany({ where: { ...inOrg, tasks: { some: { id: entityId } } }, select: { id: true } }),
              db.frameworkControlTaskLink.findMany({
                where: { taskId: entityId, control: inOrg },
                select: { controlId: true, frameworkInstanceId: true },
              }),
            ])
          : await Promise.all([
              db.control.findMany({
                where: { ...inOrg, controlDocumentTypes: { some: { formType: asFormType(entityId) } } },
                select: { id: true },
              }),
              db.frameworkControlDocumentTypeLink.findMany({
                where: { formType: asFormType(entityId), control: inOrg },
                select: { controlId: true, frameworkInstanceId: true },
              }),
            ]);

    for (const c of direct) addScope({ scope, controlId: c.id });
    for (const l of scoped) {
      addScope({ scope, controlId: l.controlId, frameworkInstanceId: l.frameworkInstanceId });
    }
    return scope;
  }
}
