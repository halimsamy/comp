'use client';

import { type MemberAccessAccount, useMemberAccessAccounts } from '@/hooks/use-access-roles';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Stack,
  Text,
} from '@trycompai/design-system';
import Link from 'next/link';
import { useMemo } from 'react';
import { AccessFlagBadges, MfaCell } from '../../access/components/AccessFlagBadges';
import { formatDay } from '../../access/lib/access-labels';

/**
 * #83: the member's accounts across every system (Comp AI, connected
 * integrations, manual systems), from the same access inventory that access
 * reviews and offboarding use. Read-only.
 */
export function EmployeeAccess({ memberId, organizationId }: { memberId: string; organizationId: string }) {
  const { accounts, error, isLoading } = useMemberAccessAccounts(memberId);
  const bySystem = useMemo(() => {
    const groups = new Map<string, { name: string; accounts: MemberAccessAccount[] }>();
    for (const account of accounts) {
      const group = groups.get(account.system.key) ?? { name: account.system.name, accounts: [] };
      group.accounts.push(account);
      groups.set(account.system.key, group);
    }
    return [...groups.entries()];
  }, [accounts]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton style={{ height: 96, width: '100%' }} />
        ) : error ? (
          <Text size="sm" variant="muted">
            Couldn&apos;t load access information. Try refreshing the page.
          </Text>
        ) : bySystem.length === 0 ? (
          <Stack gap="2">
            <Text size="sm" variant="muted">
              No accounts in the access inventory belong to this person.
            </Text>
            <Link href={`/${organizationId}/people?tab=access`} className="text-sm font-medium text-primary hover:underline">
              Open the access inventory →
            </Link>
          </Stack>
        ) : (
          <Stack gap="3">
            {bySystem.map(([key, group]) => (
              <div key={key} className="rounded-lg border border-border">
                <div className="border-b border-border px-4 py-2 text-sm font-medium">{group.name}</div>
                {group.accounts.map((account) => (
                  <div
                    key={account.accountId}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">{account.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {account.roles.join(', ') || 'No role'} · last login {formatDay(account.lastLoginAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {account.status !== 'active' && <Badge variant="secondary">{account.status}</Badge>}
                      <MfaCell value={account.mfaEnabled} />
                      <AccessFlagBadges flags={account.flags} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
