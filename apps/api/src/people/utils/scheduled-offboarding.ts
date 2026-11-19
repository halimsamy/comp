import { db } from '@db';
import {
  clearAssignments,
  collectAssignedItems,
  deactivateMember,
  notifyOwnerOfUnassignedItems,
  removeMemberFromOrgChart,
} from './member-deactivation';

/**
 * #82: members whose offboard date has passed are deactivated automatically
 * (signed out everywhere, assignments cleared, owner told what was unassigned).
 * Owners and platform admins are never deactivated by the schedule.
 */
export async function deactivateDueLeavers(now = new Date()) {
  const due = await db.member.findMany({
    where: { deactivated: false, offboardDate: { lte: now } },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      role: true,
      offboardDate: true,
      user: { select: { name: true, email: true, role: true } },
    },
  });
  const leavers = due.filter((m) => !m.role.includes('owner') && m.user.role !== 'admin');
  for (const member of leavers) {
    const { id: memberId, organizationId } = member;
    const unassignedItems = await collectAssignedItems({ memberId, organizationId });
    await clearAssignments({ memberId, organizationId });
    await removeMemberFromOrgChart({ organizationId, memberId });
    await deactivateMember({
      memberId,
      organizationId,
      userId: member.userId,
      offboardDate: member.offboardDate,
    });
    await notifyOwnerOfUnassignedItems({
      organizationId,
      removedMemberName: member.user.name || member.user.email,
      unassignedItems,
    });
  }
  return { deactivated: leavers.length, skipped: due.length - leavers.length };
}
