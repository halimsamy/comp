'use client';

import {
  Alert,
  AlertDescription,
  Badge,
  HStack,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Stack,
  Text,
} from '@trycompai/design-system';
import { WarningAlt } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api-client';
import { SelectLabel, optionLabels } from './shared';

interface PolicyOption {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'needs_review';
}

const NONE = 'none';

const STATUS_LABELS: Record<PolicyOption['status'], string> = {
  draft: 'Draft',
  published: 'Published',
  needs_review: 'Needs review',
};

/** The linked policy id stored in a 9.2 / 9.3 narrative, or null. */
export function parseGoverningPolicyId(narrative: unknown): string | null {
  if (!narrative || typeof narrative !== 'object' || !('governingPolicyId' in narrative)) {
    return null;
  }
  const value = narrative.governingPolicyId;
  return typeof value === 'string' && value ? value : null;
}

/** Active (non-archived) org policies, without content. */
function useOrgPolicies() {
  return useSWR('/v1/policies?excludeContent=true', async (key: string) => {
    const response = await api.get<{ data: PolicyOption[] }>(key);
    if (response.error || !response.data) {
      throw new Error(response.error ?? 'Failed to load policies');
    }
    return Array.isArray(response.data.data) ? response.data.data : [];
  });
}

interface GoverningPolicyPickerProps {
  policyId: string | null;
  canEdit: boolean;
  /** What the paragraph is called on this page ("programme" / "procedure"). */
  paragraphName: string;
  onChange: (policyId: string | null) => Promise<void>;
}

/**
 * Optional link from the 9.2 programme / 9.3 procedure to the policy that
 * defines it. When linked, the generated document references the policy
 * instead of restating it; unlinking brings the saved paragraph back.
 */
export function GoverningPolicyPicker({
  policyId,
  canEdit,
  paragraphName,
  onChange,
}: GoverningPolicyPickerProps) {
  const params = useParams<{ orgId: string }>();
  const { data: policies, error, isLoading } = useOrgPolicies();
  const [isSaving, setIsSaving] = useState(false);
  const options = Array.isArray(policies) ? policies : [];
  const linked = policyId ? options.find((policy) => policy.id === policyId) : undefined;

  const handleChange = async (value: unknown) => {
    const next = typeof value === 'string' && value !== NONE ? value : null;
    if (next === policyId) return;
    setIsSaving(true);
    try {
      await onChange(next);
    } catch {
      // The caller toasts the failure; the select keeps the saved value.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack gap="2">
      <Text size="sm" weight="medium">
        Governing policy
      </Text>
      {canEdit ? (
        <div className="w-full sm:max-w-md">
          <Select
            value={policyId ?? NONE}
            onValueChange={handleChange}
            disabled={isSaving || isLoading || !!error}
          >
            <SelectTrigger aria-label="Governing policy">
              <SelectLabel
                labels={{ [NONE]: `None (use the ${paragraphName} paragraph)`, ...optionLabels(options) }}
                placeholder={isLoading ? 'Loading policies…' : 'Select a policy'}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None (use the {paragraphName} paragraph)</SelectItem>
              {options.map((policy) => (
                <SelectItem key={policy.id} value={policy.id}>
                  {policy.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {error ? (
        <Text size="sm" variant="muted">
          Could not load policies.
        </Text>
      ) : null}
      {linked ? (
        <HStack align="center" gap="2" wrap="wrap">
          <Link
            href={`/${params?.orgId ?? ''}/policies/${linked.id}`}
            className="text-sm font-medium underline underline-offset-4"
          >
            {linked.name}
          </Link>
          <Badge variant={linked.status === 'published' ? 'secondary' : 'outline'}>
            {STATUS_LABELS[linked.status] ?? linked.status}
          </Badge>
        </HStack>
      ) : null}
      {!canEdit && !policyId ? (
        <Text size="sm" variant="muted">
          None. The {paragraphName} paragraph below is used.
        </Text>
      ) : null}
      {linked && linked.status !== 'published' ? (
        <Alert variant="warning" icon={<WarningAlt />}>
          <AlertDescription>
            This policy is not published. The generated document will cite it as not yet published.
          </AlertDescription>
        </Alert>
      ) : null}
      {policyId && Array.isArray(policies) && !linked ? (
        <Alert variant="warning" icon={<WarningAlt />}>
          <AlertDescription>
            The linked policy was archived or deleted, so the generated document uses the saved{' '}
            {paragraphName} paragraph. Choose another policy or unlink it.
          </AlertDescription>
        </Alert>
      ) : null}
    </Stack>
  );
}
