'use client';

import { useSlaPolicy, type SlaPolicy } from '@/hooks/use-vulnerability-program';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, FieldError, Input, Stack, Text } from '@trycompai/design-system';
import { format } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { slaPolicySchema, type SlaPolicyValues } from '../lib/vulnerability-schema';

const FIELDS: { name: keyof SlaPolicyValues; label: string; hint: string }[] = [
  { name: 'criticalDays', label: 'Critical', hint: 'At most 30 days (PCI DSS 6.3.3)' },
  { name: 'highDays', label: 'High', hint: 'Fix and rescan (PCI DSS 11.3.1)' },
  { name: 'mediumDays', label: 'Medium', hint: 'Per your risk ranking (6.3.1)' },
  { name: 'lowDays', label: 'Low', hint: 'Per your risk ranking (6.3.1)' },
];

const toValues = (policy?: SlaPolicy): SlaPolicyValues => ({
  criticalDays: policy?.criticalDays ?? 30,
  highDays: policy?.highDays ?? 30,
  mediumDays: policy?.mediumDays ?? 90,
  lowDays: policy?.lowDays ?? 180,
});

/** Org remediation SLA: days per severity, linked to the patch policy; saving re-dates open findings. */
export function SlaPolicyTab({ canEdit }: { canEdit: boolean }) {
  const { orgId } = useParams<{ orgId: string }>();
  const { policy, error, isLoading, save } = useSlaPolicy();
  const form = useForm<SlaPolicyValues>({
    resolver: zodResolver(slaPolicySchema),
    defaultValues: toValues(policy),
  });

  useEffect(() => {
    if (policy) form.reset(toValues(policy));
  }, [policy, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await save(values);
      toast.success('SLA policy saved. Due dates of open findings were updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the SLA policy');
    }
  });

  if (isLoading)
    return (
      <Text size="sm" variant="muted">
        Loading SLA policy…
      </Text>
    );
  if (error) {
    return (
      <Text size="sm" variant="destructive">
        Could not load the SLA policy. Refresh the page to try again.
      </Text>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="max-w-2xl">
      <Stack gap="4">
        <Text size="sm" variant="muted">
          Days to fix a vulnerability, counted from first detection. Saving recalculates the due
          date of open findings; resolved and accepted ones keep their history. Changes are kept in
          the event log.
          {policy?.policy ? ' This should match your ' : ''}
          {policy?.policy ? (
            <Link className="underline" href={`/${orgId}/policies/${policy.policy.id}`}>
              {policy.policy.name}
            </Link>
          ) : null}
          {policy?.policy ? ' policy.' : ''}
        </Text>
        <fieldset disabled={!canEdit} className="min-w-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Controller
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field: { ref: _ref, value, onChange, ...field }, fieldState }) => (
                  <Stack gap="1">
                    <Text size="xs" variant="muted" weight="medium">
                      {`${f.label} (days)`}
                    </Text>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      aria-label={`${f.label} days`}
                      value={Number.isFinite(value) ? String(value) : ''}
                      onChange={(event) => onChange(event.target.valueAsNumber)}
                    />
                    <Text size="xs" variant="muted">
                      {f.hint}
                    </Text>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </Stack>
                )}
              />
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text size="xs" variant="muted">
            {policy?.isDefault || !policy?.updatedAt
              ? 'Using the default policy.'
              : `Last changed ${format(new Date(policy.updatedAt), 'MMM d, yyyy')}.`}
          </Text>
          {canEdit ? (
            <Button type="submit" loading={form.formState.isSubmitting}>
              Save SLA policy
            </Button>
          ) : null}
        </div>
      </Stack>
    </form>
  );
}
