import { db, Prisma } from '@db';

type DbClient = Prisma.TransactionClient | typeof db;

/**
 * Evidence once, map many: copy a control's control-level (direct) policy, task
 * and evidence-form links onto every framework instance that maps the control,
 * so one link counts for ISO 27001, PCI DSS and any custom framework alike.
 * Framework-scoped links written with an explicit frameworkInstanceId stay a
 * per-framework choice and are not copied anywhere.
 */
export async function syncDirectLinksToAllFrameworks({
  controlId,
  organizationId,
  client,
}: {
  controlId: string;
  organizationId: string;
  client?: DbClient;
}) {
  async function run(prisma: DbClient) {
    const mapped = await prisma.requirementMap.findMany({
      where: {
        controlId,
        archivedAt: null,
        frameworkInstance: { organizationId },
      },
      select: { frameworkInstanceId: true },
      distinct: ['frameworkInstanceId'],
    });
    if (mapped.length === 0) return;

    const control = await prisma.control.findUnique({
      where: { id: controlId, organizationId },
      include: {
        policies: { where: { archivedAt: null }, select: { id: true } },
        tasks: { where: { archivedAt: null }, select: { id: true } },
        controlDocumentTypes: { select: { formType: true } },
      },
    });
    if (!control) return;

    const fiIds = mapped.map((r) => r.frameworkInstanceId);

    await Promise.all([
      control.policies.length > 0 &&
        prisma.frameworkControlPolicyLink.createMany({
          data: fiIds.flatMap((frameworkInstanceId) =>
            control.policies.map((p) => ({ frameworkInstanceId, controlId, policyId: p.id })),
          ),
          skipDuplicates: true,
        }),
      control.tasks.length > 0 &&
        prisma.frameworkControlTaskLink.createMany({
          data: fiIds.flatMap((frameworkInstanceId) =>
            control.tasks.map((t) => ({ frameworkInstanceId, controlId, taskId: t.id })),
          ),
          skipDuplicates: true,
        }),
      control.controlDocumentTypes.length > 0 &&
        prisma.frameworkControlDocumentTypeLink.createMany({
          data: fiIds.flatMap((frameworkInstanceId) =>
            control.controlDocumentTypes.map((d) => ({
              frameworkInstanceId,
              controlId,
              formType: d.formType,
            })),
          ),
          skipDuplicates: true,
        }),
    ]);
  }

  if (client) {
    await run(client);
    return;
  }
  await db.$transaction((tx) => run(tx));
}

/** Fan out several controls at once (e.g. a task created with controlIds). */
export async function syncControlsToAllFrameworks({
  controlIds,
  organizationId,
}: {
  controlIds: string[];
  organizationId: string;
}) {
  for (const controlId of new Set(controlIds)) {
    await syncDirectLinksToAllFrameworks({ controlId, organizationId });
  }
}
