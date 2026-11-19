'use client';

import {
  Checkbox,
  FieldError,
  Grid,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
} from '@trycompai/design-system';
import type { ReactNode } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { AUDIT_STATUS_LABELS } from '../lib/audit-labels';
import type { AuditFormValues } from '../lib/audit-schema';
import { InviteAuditorField } from './InviteAuditorField';

export interface Option {
  id: string;
  name: string;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap="1">
      <Text size="xs" variant="muted" weight="medium">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

type TextName = 'title' | 'firmName' | 'periodStart' | 'periodEnd' | 'accessEndsAt';

function TextField({
  control,
  name,
  label,
  type = 'text',
  placeholder,
}: {
  control: Control<AuditFormValues>;
  name: TextName;
  label: string;
  type?: 'text' | 'date';
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field: { ref: _ref, ...field }, fieldState }) => (
          <>
            <Input {...field} type={type} aria-label={label} placeholder={placeholder} />
            <FieldError>{fieldState.error?.message}</FieldError>
          </>
        )}
      />
    </Field>
  );
}

function OptionSelect({
  control,
  name,
  label,
  options,
}: {
  control: Control<AuditFormValues>;
  name: 'frameworkInstanceId' | 'status';
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Field label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <>
            <Select value={field.value} onValueChange={(next) => field.onChange(next ?? '')}>
              <SelectTrigger aria-label={label}>
                <SelectValue placeholder={`Choose ${label.toLowerCase()}`}>
                  {options.find((o) => o.value === field.value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{fieldState.error?.message}</FieldError>
          </>
        )}
      />
    </Field>
  );
}

/** Engagement fields: framework, firm, period, access end and auditors. */
export function AuditFormFields({
  control,
  isNew,
  frameworks,
  auditors,
}: {
  control: Control<AuditFormValues>;
  isNew: boolean;
  frameworks: Option[];
  auditors: Option[];
}) {
  return (
    <Stack gap="4">
      {isNew ? (
        <OptionSelect
          control={control}
          name="frameworkInstanceId"
          label="Framework"
          options={frameworks.map((f) => ({ value: f.id, label: f.name }))}
        />
      ) : (
        <OptionSelect
          control={control}
          name="status"
          label="Status"
          options={Object.entries(AUDIT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
      )}
      <TextField control={control} name="title" label="Audit name" placeholder="e.g. ISO 27001 surveillance audit 2026" />
      <TextField control={control} name="firmName" label="Audit firm" placeholder="Certification body or QSA company" />
      <Grid cols={{ base: '1', sm: '2' }} gap="4">
        <TextField control={control} name="periodStart" label="Audit period starts" type="date" />
        <TextField control={control} name="periodEnd" label="Audit period ends" type="date" />
      </Grid>
      <TextField control={control} name="accessEndsAt" label="Auditor access ends" type="date" />
      <Field label="Auditors">
        <Controller
          control={control}
          name="auditorMemberIds"
          render={({ field }) =>
            auditors.length === 0 ? (
              <Text size="sm" variant="muted">
                No one has the Auditor role yet. Invite your auditors by email below.
              </Text>
            ) : (
              <div className="space-y-2 rounded-md border border-border p-3">
                {auditors.map((auditor) => {
                  const checked = field.value.includes(auditor.id);
                  return (
                    <label key={auditor.id} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next
                              ? [...field.value, auditor.id]
                              : field.value.filter((id) => id !== auditor.id),
                          )
                        }
                      />
                      <Text size="sm">{auditor.name}</Text>
                    </label>
                  );
                })}
              </div>
            )
          }
        />
      </Field>
      <Field label="Invite an auditor by email">
        <Controller
          control={control}
          name="pendingAuditorEmails"
          render={({ field }) => <InviteAuditorField value={field.value} onChange={field.onChange} />}
        />
      </Field>
    </Stack>
  );
}
