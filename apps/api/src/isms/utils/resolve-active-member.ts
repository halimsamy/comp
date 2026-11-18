import { NotFoundException } from '@nestjs/common';
import { db } from '@db';

/**
 * Three-state member reference used by the ISMS registers: undefined = leave
 * as-is, null/blank = clear, otherwise the id of an ACTIVE member of the org.
 */
export async function resolveActiveMember({
  memberId,
  organizationId,
}: {
  memberId: string | null | undefined;
  organizationId: string;
}): Promise<string | null | undefined> {
  if (memberId === undefined) return undefined;
  const trimmed = memberId?.trim();
  if (!trimmed) return null;
  const member = await db.member.findFirst({
    where: { id: trimmed, organizationId, deactivated: false },
    select: { id: true },
  });
  if (!member) {
    throw new NotFoundException('Active member not found in organization');
  }
  return trimmed;
}
