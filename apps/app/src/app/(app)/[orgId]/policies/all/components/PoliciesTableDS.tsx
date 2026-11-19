'use client';

import {
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { PolicyRegisterRow, RegisterSort } from '../../lib/policy-register';
import {
  AcknowledgedCell,
  FrameworksCell,
  LastApprovedCell,
  NextReviewCell,
  PersonCell,
  SortableHeader,
  StatusCell,
  VersionCell,
} from './policy-register-cells';
import { usePolicyTailoringStatus, type PolicyTailoringStatus } from './policy-tailoring-context';

const ACTIVE_STATUSES: PolicyTailoringStatus[] = ['queued', 'pending', 'processing'];

interface PoliciesTableDSProps {
  policies: PolicyRegisterRow[];
  sort: RegisterSort;
  direction: 'asc' | 'desc';
  onSort: (column: RegisterSort) => void;
  /** Row selection for bulk actions; omitted for users who cannot act. */
  selection?: {
    selectedIds: Set<string>;
    onToggle: (policyId: string) => void;
    onToggleAll: (checked: boolean) => void;
  };
}

/** The policy register: the auditor columns ISO 27001 7.5 / PCI DSS 12.1 ask for. */
export function PoliciesTableDS({
  policies,
  sort,
  direction,
  onSort,
  selection,
}: PoliciesTableDSProps) {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();

  if (policies.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border">
        <Text variant="muted">No policies match these filters.</Text>
      </div>
    );
  }

  const allSelected = Boolean(selection) && policies.every((p) => selection?.selectedIds.has(p.id));
  const headerProps = { sort, direction, onSort };

  return (
    <Table variant="bordered">
      <TableHeader>
        <TableRow>
          {selection && (
            <TableHead>
              <Checkbox
                aria-label="Select all policies"
                checked={allSelected}
                onCheckedChange={(checked) => selection.onToggleAll(checked === true)}
              />
            </TableHead>
          )}
          <TableHead>
            <SortableHeader label="Policy" column="name" {...headerProps} />
          </TableHead>
          <TableHead>
            <SortableHeader label="Status" column="status" {...headerProps} />
          </TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Approver</TableHead>
          <TableHead>Last approved</TableHead>
          <TableHead>
            <SortableHeader label="Next review" column="nextReview" {...headerProps} />
          </TableHead>
          <TableHead>Acknowledged</TableHead>
          <TableHead>Frameworks</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {policies.map((policy) => (
          <PolicyRow
            key={policy.id}
            policy={policy}
            orgId={orgId}
            selection={selection}
            onOpen={() => router.push(`/${orgId}/policies/${policy.id}`)}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function PolicyRow({
  policy,
  orgId,
  selection,
  onOpen,
}: {
  policy: PolicyRegisterRow;
  orgId: string;
  selection: PoliciesTableDSProps['selection'];
  onOpen: () => void;
}) {
  const tailoring = usePolicyTailoringStatus(policy.id);
  const isTailoring = Boolean(tailoring && ACTIVE_STATUSES.includes(tailoring));

  return (
    <TableRow
      onClick={() => !isTailoring && onOpen()}
      style={{ cursor: isTailoring ? 'not-allowed' : 'pointer' }}
      data-state={selection?.selectedIds.has(policy.id) ? 'selected' : undefined}
    >
      {selection && (
        <TableCell onClick={(event) => event.stopPropagation()}>
          <Checkbox
            aria-label={`Select ${policy.name}`}
            checked={selection.selectedIds.has(policy.id)}
            onCheckedChange={() => selection.onToggle(policy.id)}
          />
        </TableCell>
      )}
      <TableCell>
        {isTailoring ? (
          <Text size="sm" variant="muted">
            {policy.name}
          </Text>
        ) : (
          <Link
            href={`/${orgId}/policies/${policy.id}`}
            onClick={(event) => event.stopPropagation()}
            className="block min-w-[12rem] font-medium hover:underline"
          >
            {policy.name}
          </Link>
        )}
      </TableCell>
      <TableCell>
        <StatusCell policy={policy} tailoring={isTailoring ? tailoring : undefined} />
      </TableCell>
      <TableCell>
        <VersionCell policy={policy} />
      </TableCell>
      <TableCell>
        <PersonCell person={policy.assignee ?? null} />
      </TableCell>
      <TableCell>
        {/* The pending approver, else whoever approved the version in force. */}
        <PersonCell person={policy.approver ?? policy.currentVersion?.approvedBy ?? null} />
      </TableCell>
      <TableCell>
        <LastApprovedCell policy={policy} />
      </TableCell>
      <TableCell>
        <NextReviewCell policy={policy} />
      </TableCell>
      <TableCell>
        <AcknowledgedCell policy={policy} />
      </TableCell>
      <TableCell>
        <FrameworksCell frameworks={policy.frameworks} />
      </TableCell>
    </TableRow>
  );
}
