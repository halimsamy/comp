'use client';

import type { VendorTpspFields } from '@/hooks/use-vendors';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
} from '@trycompai/design-system';
import { Controller, useForm, type Control } from 'react-hook-form';
import {
  ASSURANCE_LABEL,
  CRITICALITY_OPTIONS,
  DATA_TYPE_OPTIONS,
  PCI_STATUS,
} from '../../../lib/vendor-tpsp';
import {
  toFormValues,
  toUpdatePayload,
  tpspProfileSchema,
  type TpspProfileValues,
} from './tpsp-profile-form';

type Options = { value: string; label: string }[];
const withUnset = (options: Options, label: string) => [{ value: 'unset', label }, ...options];
const CRITICALITY_ITEMS = withUnset(CRITICALITY_OPTIONS, 'Not classified');
const ASSURANCE_ITEMS = withUnset(
  Object.entries(ASSURANCE_LABEL).map(([value, label]) => ({ value, label })),
  'Not set',
);
const PCI_ITEMS = withUnset(
  Object.entries(PCI_STATUS).map(([value, { label }]) => ({ value, label })),
  'Not set',
);

type Key = keyof TpspProfileValues;
type DateName = { [K in Key]: TpspProfileValues[K] extends string ? K : never }[Key];
type BoolName = { [K in Key]: TpspProfileValues[K] extends boolean ? K : never }[Key];

function SelectField({
  control,
  name,
  label,
  items,
}: {
  control: Control<TpspProfileValues>;
  name: 'criticality' | 'assuranceType' | 'pciStatus';
  label: string;
  items: Options;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`tpsp-${name}`}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
            <SelectTrigger id={`tpsp-${name}`} aria-label={label}>
              <SelectValue>{items.find((i) => i.value === field.value)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

function DateField({
  control,
  name,
  label,
}: {
  control: Control<TpspProfileValues>;
  name: DateName;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`tpsp-${name}`}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field: { ref: _ref, ...field } }) => (
          <Input {...field} id={`tpsp-${name}`} type="date" />
        )}
      />
    </div>
  );
}

function SwitchField({
  control,
  name,
  label,
  hint,
}: {
  control: Control<TpspProfileValues>;
  name: BoolName;
  label: string;
  hint?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{label}</span>
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
          </span>
          <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={label} />
        </label>
      )}
    />
  );
}

/** Edit sheet for the TPSP profile (ISO 27001 A.5.19-A.5.22, PCI DSS 12.8). */
export function EditTpspProfileSheet({
  open,
  onOpenChange,
  vendor,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: Partial<VendorTpspFields>;
  onSave: (payload: ReturnType<typeof toUpdatePayload>) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<TpspProfileValues>({
    resolver: zodResolver(tpspProfileSchema),
    values: toFormValues(vendor),
  });

  const handleSave = handleSubmit(async (values) => {
    await onSave(toUpdatePayload(values));
    onOpenChange(false);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit third-party profile</SheetTitle>
          <SheetDescription>
            Classification, contract and assurance details used for reviews and the PCI DSS 12.8
            TPSP list.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="tpsp-profile-form" onSubmit={handleSave} className="flex flex-col gap-5 pb-4">
            <SelectField
              control={control}
              name="criticality"
              label="Criticality"
              items={CRITICALITY_ITEMS}
            />
            <SwitchField
              control={control}
              name="handlesCardholderData"
              label="Account data is shared"
              hint="Stores, processes or transmits cardholder data for you (12.8.1)"
            />
            <SwitchField
              control={control}
              name="affectsCdeSecurity"
              label="Can affect CDE security"
              hint="E.g. hosting, network, or security tooling in scope"
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Data types</legend>
              <Controller
                control={control}
                name="dataTypes"
                render={({ field }) => (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {DATA_TYPE_OPTIONS.map((option) => (
                      <label key={option.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(option.value)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, option.value]
                                : field.value.filter((v) => v !== option.value),
                            )
                          }
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                )}
              />
            </fieldset>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateField control={control} name="contractStartDate" label="Contract start" />
              <DateField control={control} name="contractEndDate" label="Contract end" />
            </div>
            {errors.contractEndDate && (
              <span role="alert" className="text-xs text-destructive">
                {errors.contractEndDate.message}
              </span>
            )}
            <SwitchField
              control={control}
              name="securityClausesConfirmed"
              label="Security clauses in contract"
              hint="ISO 27001 A.5.20"
            />
            <SwitchField
              control={control}
              name="confidentialityClausesConfirmed"
              label="Confidentiality clauses in contract"
            />
            <DateField
              control={control}
              name="tpspAcknowledgementDate"
              label="Written acknowledgement received (12.8.2)"
            />
            <SelectField
              control={control}
              name="assuranceType"
              label="Assurance"
              items={ASSURANCE_ITEMS}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DateField control={control} name="assurancePeriodStart" label="Period start" />
              <DateField control={control} name="assurancePeriodEnd" label="Period end" />
            </div>
            <DateField control={control} name="assuranceExpiresAt" label="Assurance expires" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                control={control}
                name="pciStatus"
                label="PCI DSS status"
                items={PCI_ITEMS}
              />
              <DateField
                control={control}
                name="pciStatusCheckedAt"
                label="Status checked (12.8.4)"
              />
            </div>
            <DateField control={control} name="nextReviewDue" label="Next review due" />
          </form>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="tpsp-profile-form"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Save profile
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
