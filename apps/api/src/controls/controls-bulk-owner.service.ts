import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type { BulkControlOwnerDto } from './dto/bulk-owner.dto';

/** Sets (or clears) the owner of many controls at once, optionally handing them their unassigned work. */
@Injectable()
export class ControlsBulkOwnerService {
  async setOwner({ organizationId, dto }: { organizationId: string; dto: BulkControlOwnerDto }) {
    const controlIds = [...new Set(dto.controlIds)];
    const controls = await db.control.findMany({
      where: { id: { in: controlIds }, organizationId, archivedAt: null },
      select: {
        id: true,
        tasks: { where: { archivedAt: null, assigneeId: null }, select: { id: true } },
        policies: { where: { archivedAt: null, assigneeId: null }, select: { id: true } },
        frameworkTaskLinks: {
          where: { task: { archivedAt: null, assigneeId: null } },
          select: { taskId: true },
        },
        frameworkPolicyLinks: {
          where: { policy: { archivedAt: null, assigneeId: null } },
          select: { policyId: true },
        },
      },
    });
    if (controls.length !== controlIds.length) throw new NotFoundException('Control not found');

    const ownerId = dto.ownerId;
    if (ownerId) {
      const member = await db.member.findFirst({
        where: { id: ownerId, organizationId, deactivated: false },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('Member not found');
    } else if (dto.assignLinkedWork) {
      throw new BadRequestException('Pick an owner to assign linked work to');
    }

    const assignWork = !!ownerId && dto.assignLinkedWork === true;
    const taskIds = assignWork
      ? [
          ...new Set(
            controls.flatMap((c) => [
              ...c.tasks.map((t) => t.id),
              ...c.frameworkTaskLinks.map((l) => l.taskId),
            ]),
          ),
        ]
      : [];
    const policyIds = assignWork
      ? [
          ...new Set(
            controls.flatMap((c) => [
              ...c.policies.map((p) => p.id),
              ...c.frameworkPolicyLinks.map((l) => l.policyId),
            ]),
          ),
        ]
      : [];

    const [updated, tasks, policies] = await db.$transaction([
      db.control.updateMany({ where: { id: { in: controlIds }, organizationId }, data: { ownerId } }),
      // Re-check assigneeId: only fill gaps, never take work from someone.
      db.task.updateMany({
        where: { id: { in: taskIds }, organizationId, assigneeId: null },
        data: { assigneeId: ownerId },
      }),
      db.policy.updateMany({
        where: { id: { in: policyIds }, organizationId, assigneeId: null },
        data: { assigneeId: ownerId },
      }),
    ]);
    return { controls: updated.count, tasks: tasks.count, policies: policies.count };
  }
}
