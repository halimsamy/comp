import { AttachmentEntityType, type ChecklistKind, db } from '@db';
import type { AttachmentsService } from '../attachments/attachments.service';
import { appliesToMember } from '../people-lifecycle/checklist-progress';
import { DEFAULT_CHECKLIST_ITEMS } from './default-checklist-items';

/** One member's checklist (targeted by role and department), with evidence download links. */
export async function loadMemberChecklist({
  organizationId,
  memberId,
  kind,
  attachments,
}: {
  organizationId: string;
  memberId: string;
  kind: ChecklistKind;
  attachments: AttachmentsService;
}) {
  await seedChecklistDefaults(organizationId, kind);

  const [allTemplateItems, member] = await Promise.all([
    db.offboardingChecklistTemplate.findMany({
      where: { organizationId, isEnabled: true, kind },
      orderBy: { sortOrder: 'asc' },
    }),
    db.member.findFirst({
      where: { id: memberId, organizationId },
      select: { role: true, department: true },
    }),
  ]);
  // #91: items can target roles and departments.
  const templateItems = member
    ? allTemplateItems.filter((item) => appliesToMember({ item, member }))
    : allTemplateItems;

  const completions = await db.offboardingChecklistCompletion.findMany({
    where: { organizationId, memberId, templateItem: { kind } },
    include: { completedBy: { select: { id: true, name: true } } },
  });

  const completionMap = new Map(
    completions.map((c) => [c.templateItemId, c]),
  );

  const completionIds = completions.map((c) => c.id);

  const allAttachments =
    completionIds.length > 0
      ? await db.attachment.findMany({
          where: {
            organizationId,
            entityId: { in: completionIds },
            entityType: AttachmentEntityType.offboarding_checklist,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

  const attachmentsByCompletion = new Map<string, typeof allAttachments>();
  for (const attachment of allAttachments) {
    const existing = attachmentsByCompletion.get(attachment.entityId) ?? [];
    existing.push(attachment);
    attachmentsByCompletion.set(attachment.entityId, existing);
  }

  const items = await Promise.all(
    templateItems.map(async (template) => {
      const completion = completionMap.get(template.id);
      const rawAttachments = completion
        ? (attachmentsByCompletion.get(completion.id) ?? [])
        : [];

      const evidence = await Promise.all(
        rawAttachments.map(async (attachment) => ({
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          downloadUrl: await attachments.getPresignedDownloadUrl(attachment.url),
          createdAt: attachment.createdAt,
        })),
      );

      return {
        ...template,
        templateItemId: template.id,
        completed: !!completion,
        completion: completion ?? null,
        evidence,
      };
    }),
  );

  return {
    items,
    totalItems: items.length,
    completedItems: items.filter((i) => i.completed).length,
  };
}

/** Departed members whose offboarding checklist is still open. */
export async function pendingOffboardings(organizationId: string) {
  await seedChecklistDefaults(organizationId, 'offboarding');

  const totalEnabled = await db.offboardingChecklistTemplate.count({
    where: { organizationId, isEnabled: true, kind: 'offboarding' },
  });

  const offboardedMembers = await db.member.findMany({
    where: {
      organizationId,
      offboardDate: { not: null },
      deactivated: true,
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      offboardingChecklistCompletions: {
        where: {
          templateItem: { organizationId, isEnabled: true, kind: 'offboarding' },
        },
        select: { id: true },
      },
    },
    orderBy: { offboardDate: 'desc' },
  });

  return {
    members: offboardedMembers
      .filter((m) => m.offboardingChecklistCompletions.length < totalEnabled)
      .map((m) => ({
        memberId: m.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        offboardDate: m.offboardDate,
        completedItems: m.offboardingChecklistCompletions.length,
        totalItems: totalEnabled,
      })),
  };
}

/** Creates the default checklist the first time an organization uses it. */
export async function seedChecklistDefaults(
  organizationId: string,
  kind: ChecklistKind,
) {
  const count = await db.offboardingChecklistTemplate.count({
    where: { organizationId, kind },
  });

  if (count > 0) {
    return;
  }

  try {
    await db.$transaction(async (tx) => {
      const recheck = await tx.offboardingChecklistTemplate.count({
        where: { organizationId, kind },
      });

      if (recheck > 0) {
        return;
      }

      await tx.offboardingChecklistTemplate.createMany({
        data: DEFAULT_CHECKLIST_ITEMS[kind].map((item) => ({
          organizationId,
          kind,
          title: item.title,
          description: item.description,
          evidenceRequired: item.evidenceRequired,
          dueDays: item.dueDays,
          autoCompleteSource: item.autoCompleteSource,
        isAccessRevocation: item.isAccessRevocation,
        sortOrder: item.sortOrder,
        isDefault: true,
        isEnabled: true,
      })),
      });
    });
  } catch (err) {
    const isPrismaConflict =
      err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002';
    if (!isPrismaConflict) throw err;
  }
}
