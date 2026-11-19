import { db } from '@db';
import type { ImportAccountDto } from './dto/access-accounts.dto';

/**
 * #89: the CSV's owner and justification columns become owner mappings.
 * An owner is matched by email or by member name; a service/shared account
 * with a justification is recorded as a justified non-human account.
 * Returns the upserts to run in the import transaction.
 */
export async function importedOwnerMappings({
  organizationId,
  systemKey,
  accounts,
}: {
  organizationId: string;
  systemKey: string;
  accounts: [string, ImportAccountDto][];
}) {
  const withOwner = accounts.filter(([, a]) => a.owner?.trim() || a.justification?.trim());
  if (withOwner.length === 0) return [];
  const members = await db.member.findMany({
    where: { organizationId },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const findMember = (owner: string) => {
    const value = owner.trim().toLowerCase();
    return (
      members.find(
        (m) => m.user.email.toLowerCase() === value || m.user.name?.trim().toLowerCase() === value,
      ) ?? null
    );
  };
  return withOwner.flatMap(([accountId, a]) => {
    const member = a.owner ? findMember(a.owner) : null;
    const isServiceAccount = !member && (a.type === 'service' || a.type === 'shared');
    const justification = a.justification?.trim() || null;
    if (!member && !(isServiceAccount && justification)) return [];
    const data = {
      memberId: member?.id ?? null,
      isServiceAccount,
      justification,
    };
    return [
      db.accessAccountOwner.upsert({
        where: { organizationId_systemKey_accountId: { organizationId, systemKey, accountId } },
        create: { organizationId, systemKey, accountId, ...data },
        update: data,
      }),
    ];
  });
}
