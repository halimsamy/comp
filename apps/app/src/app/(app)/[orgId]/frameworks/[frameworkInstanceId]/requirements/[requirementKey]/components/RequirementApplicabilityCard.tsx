'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { APPLICABILITY_LABELS, type ApplicabilityStatus } from '@/lib/control-compliance';
import { Badge, Button, Card, Text } from '@trycompai/design-system';
import { Edit } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState } from 'react';
import type { ApplicabilityRecord, ApplicabilityRules } from './applicability-schema';
import { RequirementApplicabilitySheet } from './RequirementApplicabilitySheet';

const STATUS_VARIANT: Record<ApplicabilityStatus, 'default' | 'secondary' | 'outline'> = {
  applicable: 'secondary',
  not_applicable: 'outline',
  compensating_control: 'default',
  customized_approach: 'default',
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function RequirementApplicabilityCard({
  orgId,
  frameworkInstanceId,
  requirementKey,
  record,
  rules,
}: {
  orgId: string;
  frameworkInstanceId: string;
  requirementKey: string;
  record: ApplicabilityRecord | null;
  rules: ApplicabilityRules;
}) {
  const { hasPermission } = usePermissions();
  const [isOpen, setIsOpen] = useState(false);
  const status: ApplicabilityStatus = record?.status ?? 'applicable';
  const canEdit = rules.editable && hasPermission('framework', 'update');
  const updatedBy = record?.updatedBy?.user?.name || record?.updatedBy?.user?.email;

  return (
    <Card width="full" size="sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Text size="sm" weight="medium">
              Applicability
            </Text>
            <Badge variant={STATUS_VARIANT[status]}>{APPLICABILITY_LABELS[status]}</Badge>
          </div>
          {record?.justification ? (
            <Text size="sm">{record.justification}</Text>
          ) : (
            <Text size="sm" variant="muted">
              {status === 'applicable'
                ? 'This requirement is in scope and counts toward the framework score.'
                : 'No justification recorded.'}
            </Text>
          )}
          {record ? (
            <Text size="xs" variant="muted">
              {record.source === 'soa' ? 'From the Statement of Applicability' : 'Set manually'}
              {updatedBy ? ` by ${updatedBy}` : ''} · {formatDate(record.updatedAt)}
            </Text>
          ) : null}
          {!rules.editable && rules.reason ? (
            <Text size="xs" variant="muted">
              {rules.reason}
            </Text>
          ) : null}
        </div>
        <div className="shrink-0">
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              iconLeft={<Edit size={16} />}
              onClick={() => setIsOpen(true)}
            >
              Change
            </Button>
          ) : null}
          {rules.managedBy === 'soa' ? (
            <Link
              href={`/${orgId}/documents/statement-of-applicability`}
              className="text-sm text-primary hover:underline"
            >
              Open Statement of Applicability
            </Link>
          ) : null}
        </div>
      </div>
      {canEdit ? (
        <RequirementApplicabilitySheet
          open={isOpen}
          onOpenChange={setIsOpen}
          frameworkInstanceId={frameworkInstanceId}
          requirementKey={requirementKey}
          rules={rules}
          defaultValues={{ status, justification: record?.justification ?? '' }}
        />
      ) : null}
    </Card>
  );
}
