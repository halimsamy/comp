'use client';

import {
  extractOrgFrameworkTypes,
  FINDING_SEVERITY_CONFIG,
  useFindingActions,
} from '@/hooks/use-findings-api';
import type { FindingSeverity } from '@db';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { WarningAlt } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

const SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low'];

/**
 * "Raise finding" on a flagged requirement (#171): logs it in the one issue
 * register (Audits → Findings, and the ISO 27001 10.2 register), linked to the
 * audit and requirement, with the auditor's note as the finding.
 */
export function RaiseFindingForm({
  orgId,
  auditId,
  frameworkName,
  requirement,
  defaultContent,
}: {
  orgId: string;
  auditId: string;
  frameworkName: string;
  requirement: { id: string; identifier: string; name: string };
  defaultContent: string;
}) {
  const { createFinding } = useFindingActions();
  const [content, setContent] = useState(defaultContent);
  const [severity, setSeverity] = useState<FindingSeverity>('medium');
  const [isSaving, setIsSaving] = useState(false);
  const [raisedId, setRaisedId] = useState<string | null>(null);

  const handleRaise = async () => {
    const text = content.trim();
    if (!text) {
      toast.error('Describe the finding');
      return;
    }
    setIsSaving(true);
    try {
      const label = requirement.identifier ? `${requirement.identifier} ${requirement.name}` : requirement.name;
      const finding = await createFinding({
        area: 'compliance',
        type: extractOrgFrameworkTypes({ data: [{ name: frameworkName }] })[0],
        severity,
        content: `${label}: ${text}`,
        auditId,
        requirementId: requirement.id,
      });
      setRaisedId(finding.id);
      toast.success('Finding raised');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to raise the finding');
    } finally {
      setIsSaving(false);
    }
  };

  if (raisedId) {
    return (
      <Text size="sm">
        Finding raised.{' '}
        <Link href={`/${orgId}/audits?tab=findings&open=${raisedId}`} className="underline">
          Open it in Findings
        </Link>
      </Text>
    );
  }

  return (
    <Stack gap="2">
      <Text size="sm" weight="semibold">
        Raise a finding
      </Text>
      <Textarea
        aria-label="Finding"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={4500}
        placeholder="What is wrong and what the team must fix"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="sm:w-40">
          <Select value={severity} onValueChange={(next) => setSeverity(SEVERITIES.find((value) => value === next) ?? 'medium')}>
            <SelectTrigger aria-label="Severity">
              <SelectValue>{FINDING_SEVERITY_CONFIG[severity].label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {FINDING_SEVERITY_CONFIG[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="destructive"
          iconLeft={<WarningAlt size={16} />}
          loading={isSaving}
          onClick={() => void handleRaise()}
        >
          Raise finding
        </Button>
      </div>
    </Stack>
  );
}
