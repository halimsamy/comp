import { db } from '@db';
import { loadRoleHolders } from '../../controls/controls-owner-suggestions';

/**
 * Who reviews auto-evidence (#42): the task's last approver, else the owner of
 * a control the task proves, else the 5.3 Security Programme Owner. Active
 * members of the organization only; null when nobody fits.
 */
export async function pickNativeApprover({
  organizationId,
  taskId,
  lastApproverId,
}: {
  organizationId: string;
  taskId: string;
  lastApproverId: string | null;
}): Promise<string | null> {
  if (lastApproverId) {
    const last = await db.member.findFirst({
      where: { id: lastApproverId, organizationId, deactivated: false },
      select: { id: true },
    });
    if (last) return last.id;
  }
  const control = await db.control.findFirst({
    where: {
      organizationId,
      tasks: { some: { id: taskId } },
      owner: { is: { deactivated: false } },
    },
    orderBy: { name: 'asc' },
    select: { ownerId: true },
  });
  if (control?.ownerId) return control.ownerId;
  const holders = await loadRoleHolders(organizationId);
  return holders.find((h) => h.roleKey === 'spo')?.memberId ?? null;
}
