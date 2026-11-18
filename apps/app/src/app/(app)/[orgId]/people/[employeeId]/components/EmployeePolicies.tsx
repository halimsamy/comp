'use client';

import { usePermissions } from '@/hooks/use-permissions';
import {
  downloadAcknowledgementsCsv,
  useMemberPolicyAcknowledgements,
  type PolicyAcknowledgementHistoryItem,
} from '@/hooks/use-policy-lifecycle';
import type { Member, Policy, User } from '@db';
import { Button, Stack, Text } from '@trycompai/design-system';
import { CheckmarkFilled, Download, WarningAltFilled } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useState } from 'react';
import { toast } from 'sonner';

interface EmployeePoliciesProps {
  employee: Member & { user: User };
  policies: Policy[];
}

const formatDate = (value: string) => format(new Date(value), 'MMM d, yyyy');

function describeAcknowledgement({
  isCompleted,
  latest,
}: {
  isCompleted: boolean;
  latest: PolicyAcknowledgementHistoryItem | undefined;
}) {
  if (!latest) return isCompleted ? 'Acknowledged' : 'Not acknowledged yet';
  const version = latest.version ? `v${latest.version} ` : '';
  return isCompleted
    ? `Acknowledged ${version}on ${formatDate(latest.acknowledgedAt)}`
    : `New version pending · last signed ${version}on ${formatDate(latest.acknowledgedAt)}`;
}

export function EmployeePolicies({ employee, policies }: EmployeePoliciesProps) {
  const { hasPermission } = usePermissions();
  const canReadPolicies = hasPermission('policy', 'read');
  const { history } = useMemberPolicyAcknowledgements({
    memberId: canReadPolicies ? employee.id : '',
  });
  const [isExporting, setIsExporting] = useState(false);

  // History is newest first, so the first row per policy is the latest sign-off.
  const latestByPolicy = new Map<string, PolicyAcknowledgementHistoryItem>();
  for (const item of history) {
    if (!latestByPolicy.has(item.policyId)) latestByPolicy.set(item.policyId, item);
  }

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadAcknowledgementsCsv({ memberId: employee.id });
    } catch {
      toast.error('Failed to export acknowledgements');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Stack gap="sm">
      {canReadPolicies && history.length > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            iconLeft={<Download size={14} />}
            loading={isExporting}
            onClick={handleExport}
          >
            Export acknowledgements
          </Button>
        </div>
      )}
      {policies.length === 0 ? (
        <div className="py-6 text-center">
          <Text variant="muted">No policies required to sign.</Text>
        </div>
      ) : (
        policies.map((policy) => {
          const isCompleted = policy.signedBy.includes(employee.id);

          return (
            <div
              key={policy.id}
              className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={isCompleted ? 'text-primary' : 'text-destructive'}>
                  {isCompleted ? <CheckmarkFilled size={16} /> : <WarningAltFilled size={16} />}
                </span>
                <Text>{policy.name}</Text>
              </div>
              <Text size="xs" variant="muted">
                {describeAcknowledgement({ isCompleted, latest: latestByPolicy.get(policy.id) })}
              </Text>
            </div>
          );
        })
      )}
    </Stack>
  );
}
