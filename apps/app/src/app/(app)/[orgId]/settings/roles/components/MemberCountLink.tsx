'use client';

import Link from 'next/link';

/** "3 members" linking to People filtered to that role. */
export function MemberCountLink({
  orgId,
  role,
  count,
}: {
  orgId: string;
  role: string;
  count: number;
}) {
  return (
    <Link
      href={`/${orgId}/people?role=${encodeURIComponent(role)}`}
      onClick={(e) => e.stopPropagation()}
      className="whitespace-nowrap text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {count} {count === 1 ? 'member' : 'members'}
    </Link>
  );
}
