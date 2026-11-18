'use client';

import type { AccessAccount } from '@/hooks/use-access-reviews';
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { formatDay, mfaLabel, ownerLabel } from '../lib/access-labels';
import { AccessFlagBadges } from './AccessFlagBadges';

/** One system's accounts: owner, roles, MFA, last login, status and pre-flags. */
export function AccountsTable({
  accounts,
  canMapOwners,
  onMapOwner,
}: {
  accounts: AccessAccount[];
  canMapOwners: boolean;
  onMapOwner: (account: AccessAccount) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>MFA</TableHead>
          <TableHead>Last login</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Flags</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.accountId}>
            <TableCell>
              <div className="flex min-w-[180px] flex-col">
                <Text size="sm" weight="medium">
                  {account.name}
                </Text>
                {account.email && account.email !== account.name && (
                  <Text size="xs" variant="muted">
                    {account.email}
                  </Text>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex min-w-[140px] items-center gap-2">
                <Text size="sm" variant={account.owner || account.isServiceAccount ? 'default' : 'muted'}>
                  {ownerLabel(account)}
                </Text>
                {canMapOwners && (
                  <Button size="xs" variant="ghost" onClick={() => onMapOwner(account)}>
                    {account.owner || account.isServiceAccount ? 'Change' : 'Map'}
                  </Button>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className="max-w-[220px]">
                <Text size="sm">{account.roles.join(', ') || '—'}</Text>
              </div>
            </TableCell>
            <TableCell>{mfaLabel(account.mfaEnabled)}</TableCell>
            <TableCell>
              <span className="whitespace-nowrap">{formatDay(account.lastLoginAt)}</span>
            </TableCell>
            <TableCell>
              <Badge variant={account.status === 'active' ? 'accent' : 'secondary'}>{account.status}</Badge>
            </TableCell>
            <TableCell>
              <AccessFlagBadges flags={account.flags} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
