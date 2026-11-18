'use client';

import {
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
  Textarea,
} from '@trycompai/design-system';
import type { ReactNode } from 'react';
import { Controller, type Control } from 'react-hook-form';
import {
  ASSET_TYPE_LABELS,
  CDE_SCOPE_HELP,
  CDE_SCOPE_LABELS,
  CLASSIFICATION_LABELS,
  ENVIRONMENT_LABELS,
} from '../lib/asset-labels';
import type { AssetFormValues } from '../lib/asset-schema';

export interface MemberOption {
  id: string;
  name: string;
}

const NONE = 'none';

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

type SelectName = 'type' | 'environment' | 'cdeScope' | 'dataClassification' | 'ownerId';

function SelectField({
  control,
  name,
  label,
  options,
  disabled,
}: {
  control: Control<AssetFormValues>;
  name: SelectName;
  label: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value || NONE}
            onValueChange={(next) => field.onChange(next === NONE ? '' : next)}
            disabled={disabled}
          >
            <SelectTrigger aria-label={label}>
              <SelectValue>
                {options.find((option) => option.value === (field.value || NONE))?.label}
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
        )}
      />
    </Field>
  );
}

const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/** Name/type (manual assets only) plus the attributes people own on every asset. */
export function AssetFormFields({
  control,
  memberOptions,
  isSynced,
}: {
  control: Control<AssetFormValues>;
  memberOptions: MemberOption[];
  isSynced: boolean;
}) {
  return (
    <Stack gap="4">
      <Field label="Name">
        <Controller
          control={control}
          name="name"
          render={({ field: { ref: _ref, ...field }, fieldState }) => (
            <>
              <Input
                {...field}
                aria-label="Name"
                placeholder="e.g. Office firewall"
                disabled={isSynced}
              />
              <FieldError>{fieldState.error?.message}</FieldError>
            </>
          )}
        />
      </Field>
      <Grid cols={{ base: '1', sm: '2' }} gap="4">
        <SelectField
          control={control}
          name="type"
          label="Type"
          options={toOptions(ASSET_TYPE_LABELS)}
          disabled={isSynced}
        />
        <SelectField
          control={control}
          name="environment"
          label="Environment"
          options={toOptions(ENVIRONMENT_LABELS)}
        />
        <SelectField
          control={control}
          name="cdeScope"
          label="PCI DSS scope (12.5.2)"
          options={Object.entries(CDE_SCOPE_LABELS).map(([value, label]) => ({
            value,
            label: `${label} · ${CDE_SCOPE_HELP[value as keyof typeof CDE_SCOPE_HELP]}`,
          }))}
        />
        <SelectField
          control={control}
          name="dataClassification"
          label="Data classification"
          options={toOptions(CLASSIFICATION_LABELS)}
        />
      </Grid>
      <SelectField
        control={control}
        name="ownerId"
        label="Owner (ISO 27001 A.5.9)"
        options={[
          { value: NONE, label: 'No owner' },
          ...memberOptions.map((member) => ({ value: member.id, label: member.name })),
        ]}
      />
      <Field label="Function / description">
        <Controller
          control={control}
          name="description"
          render={({ field: { ref: _ref, ...field } }) => (
            <Textarea
              {...field}
              rows={3}
              aria-label="Function / description"
              placeholder="What this asset does and what data it holds"
            />
          )}
        />
      </Field>
    </Stack>
  );
}
