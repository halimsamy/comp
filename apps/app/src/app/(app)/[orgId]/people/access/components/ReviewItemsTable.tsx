'use client';

import type { AccessDecision, AccessReviewItem } from '@/hooks/use-access-reviews';
import {
  Badge,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { DECISION_LABEL, formatDay, mfaLabel } from '../lib/access-labels';
import { AccessFlagBadges } from './AccessFlagBadges';

const DECISIONS: AccessDecision[] = ['keep', 'revoke', 'modify'];
const DECISION_VARIANT: Record<AccessDecision, 'accent' | 'destructive' | 'outline'> = {
  keep: 'accent',
  revoke: 'destructive',
  modify: 'outline',
};

/** Review items with selection, per-row decisions and remediation tracking. */
export function ReviewItemsTable({
  items,
  systemNames,
  editable,
  selected,
  onToggle,
  onToggleAll,
  onDecide,
  onRemediate,
}: {
  items: AccessReviewItem[];
  systemNames: Map<string, string>;
  editable: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onDecide: (item: AccessReviewItem, decision: AccessDecision) => void;
  onRemediate: (item: AccessReviewItem) => void;
}) {
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {editable && (
            <TableHead>
              <Checkbox
                aria-label="Select all accounts"
                checked={allSelected}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
              />
            </TableHead>
          )}
          <TableHead>Account</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>MFA</TableHead>
          <TableHead>Last login</TableHead>
          <TableHead>Flags</TableHead>
          <TableHead>Decision</TableHead>
          <TableHead>Change done</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const needsChange = item.decision === 'revoke' || item.decision === 'modify';
          return (
            <TableRow key={item.id}>
              {editable && (
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${item.accountName}`}
                    checked={selected.has(item.id)}
                    onCheckedChange={() => onToggle(item.id)}
                  />
                </TableCell>
              )}
              <TableCell>
                <div className="flex min-w-[180px] flex-col">
                  <Text size="sm" weight="medium">
                    {item.accountName}
                  </Text>
                  <Text size="xs" variant="muted">
                    {systemNames.get(item.reviewSystemId)}
                    {item.email && item.email !== item.accountName ? ` · ${item.email}` : ''}
                  </Text>
                </div>
              </TableCell>
              <TableCell>
                <span className="whitespace-nowrap">{item.ownerName ?? 'Unmapped'}</span>
              </TableCell>
              <TableCell>
                <div className="max-w-[200px]">
                  <Text size="sm">{item.roles.join(', ') || '—'}</Text>
                </div>
              </TableCell>
              <TableCell>{mfaLabel(item.mfaEnabled)}</TableCell>
              <TableCell>
                <span className="whitespace-nowrap">{formatDay(item.lastLoginAt)}</span>
              </TableCell>
              <TableCell>
                <AccessFlagBadges flags={item.flags} />
              </TableCell>
              <TableCell>
                <div className="flex min-w-[170px] flex-col gap-1">
                  {editable ? (
                    <div className="flex gap-1" role="group" aria-label={`Decision for ${item.accountName}`}>
                      {DECISIONS.map((decision) => (
                        <Button
                          key={decision}
                          size="xs"
                          variant={item.decision === decision ? 'default' : 'outline'}
                          aria-pressed={item.decision === decision}
                          onClick={() => onDecide(item, decision)}
                        >
                          {DECISION_LABEL[decision]}
                        </Button>
                      ))}
                    </div>
                  ) : item.decision ? (
                    <div>
                      <Badge variant={DECISION_VARIANT[item.decision]}>{DECISION_LABEL[item.decision]}</Badge>
                    </div>
                  ) : (
                    <Text size="sm" variant="muted">
                      Pending
                    </Text>
                  )}
                  {item.comment && (
                    <Text size="xs" variant="muted">
                      {item.comment}
                    </Text>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {!needsChange ? (
                  <span className="text-muted-foreground">—</span>
                ) : item.remediatedAt ? (
                  <span className="whitespace-nowrap" title={item.remediationNote ?? undefined}>
                    Done {formatDay(item.remediatedAt)}
                  </span>
                ) : editable ? (
                  <Button size="xs" variant="outline" onClick={() => onRemediate(item)}>
                    Mark done
                  </Button>
                ) : (
                  <Text size="sm" variant="warning">
                    Pending
                  </Text>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
