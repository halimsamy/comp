'use client';

import {
  FieldError,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { Controller, type Control } from 'react-hook-form';
import type { ApproverOption } from './IsmsApprovalSection';
import {
  NC_STATUSES,
  NC_STATUS_LABELS,
  MANUAL_SOURCES,
  SOURCE_LABELS,
  type NonconformityFormValues,
} from './nonconformity-schema';
import { IsmsFieldLabel, SelectLabel, optionLabels } from './shared';

const NONE = 'none';

type TextName =
  | 'sourceRef'
  | 'rootCause'
  | 'correctiveAction'
  | 'closureEvidence'
  | 'effectivenessNotes'
  | 'description';

function TextField({
  control,
  name,
  label,
  placeholder,
  multiline,
  disabled,
}: {
  control: Control<NonconformityFormValues>;
  name: TextName;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <IsmsFieldLabel label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field: { ref: _ref, ...field }, fieldState }) => (
          <>
            {multiline ? (
              <Textarea
                {...field}
                rows={3}
                aria-label={label}
                placeholder={placeholder}
                disabled={disabled}
              />
            ) : (
              <Input {...field} aria-label={label} placeholder={placeholder} disabled={disabled} />
            )}
            <FieldError>{fieldState.error?.message}</FieldError>
          </>
        )}
      />
    </IsmsFieldLabel>
  );
}

function MemberField({
  control,
  name,
  label,
  memberOptions,
  disabled,
}: {
  control: Control<NonconformityFormValues>;
  name: 'ownerMemberId' | 'effectivenessReviewedById';
  label: string;
  memberOptions: ApproverOption[];
  disabled?: boolean;
}) {
  return (
    <IsmsFieldLabel label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <>
            <Select
              value={field.value || NONE}
              onValueChange={(next) => field.onChange(next === NONE ? '' : next)}
              disabled={disabled}
            >
              <SelectTrigger aria-label={label}>
                <SelectLabel labels={optionLabels(memberOptions)} placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {memberOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{fieldState.error?.message}</FieldError>
          </>
        )}
      />
    </IsmsFieldLabel>
  );
}

function DateField({
  control,
  name,
  label,
  disabled,
}: {
  control: Control<NonconformityFormValues>;
  name: 'dueDate' | 'effectivenessReviewedAt';
  label: string;
  disabled?: boolean;
}) {
  return (
    <IsmsFieldLabel label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field: { ref: _ref, ...field } }) => (
          <Input {...field} type="date" aria-label={label} disabled={disabled} />
        )}
      />
    </IsmsFieldLabel>
  );
}

/**
 * Fields of a 10.2 register entry. For an internal-audit finding only the
 * corrective-action fields are editable; the rest belongs to the 9.2 document.
 */
export function NonconformityFields({
  control,
  memberOptions,
  isAuditFinding,
}: {
  control: Control<NonconformityFormValues>;
  memberOptions: ApproverOption[];
  isAuditFinding: boolean;
}) {
  return (
    <Stack gap="4">
      {isAuditFinding ? (
        <Text size="xs" variant="muted">
          Raised in an internal audit. Its description, owner, due date and status are kept in the
          Internal Audit (9.2) document; record the corrective action and its review here.
        </Text>
      ) : (
        <Stack gap="3">
          <IsmsFieldLabel label="Source">
            <Controller
              control={control}
              name="source"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Source">
                    <SelectLabel labels={SOURCE_LABELS} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Older rows logged as "External audit" keep their source. */}
                    {(field.value === 'external_audit'
                      ? [field.value, ...MANUAL_SOURCES]
                      : MANUAL_SOURCES
                    ).map((source) => (
                      <SelectItem key={source} value={source}>
                        {SOURCE_LABELS[source]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </IsmsFieldLabel>
          <TextField
            control={control}
            name="sourceRef"
            label="Source reference"
            placeholder="e.g. MR-2026-01-A02 or INC-42"
          />
        </Stack>
      )}
      <TextField
        control={control}
        name="description"
        label="Nonconformity"
        multiline
        disabled={isAuditFinding}
        placeholder="Which requirement was not met, and how it was found"
      />
      <TextField
        control={control}
        name="rootCause"
        label="Root cause"
        multiline
        placeholder="Why it happened (10.2 b)"
      />
      <TextField
        control={control}
        name="correctiveAction"
        label="Corrective action"
        multiline
        placeholder="What was done to fix it and stop it recurring (10.2 c)"
      />
      <Stack gap="3">
        <MemberField
          control={control}
          name="ownerMemberId"
          label="Owner"
          memberOptions={memberOptions}
          disabled={isAuditFinding}
        />
        <DateField control={control} name="dueDate" label="Due date" disabled={isAuditFinding} />
        <IsmsFieldLabel label="Status">
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={isAuditFinding}>
                <SelectTrigger aria-label="Status">
                  <SelectLabel labels={NC_STATUS_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  {NC_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {NC_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </IsmsFieldLabel>
      </Stack>
      {isAuditFinding ? null : (
        <TextField
          control={control}
          name="closureEvidence"
          label="Closure evidence"
          placeholder="Free text or a link to the evidence"
        />
      )}
      <Stack gap="3">
        <DateField
          control={control}
          name="effectivenessReviewedAt"
          label="Effectiveness reviewed on"
        />
        <MemberField
          control={control}
          name="effectivenessReviewedById"
          label="Reviewed by"
          memberOptions={memberOptions}
        />
      </Stack>
      <TextField
        control={control}
        name="effectivenessNotes"
        label="Effectiveness review outcome"
        multiline
        placeholder="Did the action work? (10.2 d)"
      />
    </Stack>
  );
}
