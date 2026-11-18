'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, FieldError, HStack, Input, Textarea } from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { Controller, useForm } from 'react-hook-form';
import type { ApproverOption } from './IsmsApprovalSection';
import { RequirementOwnerFields } from './RequirementOwnerFields';
import { requirementSchema, type RequirementFormValues } from './requirement-schema';
import { IsmsAddCard } from './shared';

export type { RequirementFormValues };

interface RequirementsFormProps {
  onAdd: (values: RequirementFormValues) => Promise<void>;
  memberOptions: ApproverOption[];
}

const EMPTY: RequirementFormValues = {
  partyName: '',
  interestedPartyId: '',
  requirement: '',
  treatment: '',
  ownerMemberId: '',
  lastReviewedAt: '',
};

export function RequirementsForm({ onAdd, memberOptions }: RequirementsFormProps) {
  return (
    <IsmsAddCard addLabel="Add requirement" formTitle="New requirement">
      {({ close }) => <RequirementsFields onAdd={onAdd} memberOptions={memberOptions} onClose={close} />}
    </IsmsAddCard>
  );
}

function RequirementsFields({
  onAdd,
  memberOptions,
  onClose,
}: RequirementsFormProps & { onClose: () => void }) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<RequirementFormValues>({
    resolver: zodResolver(requirementSchema),
    defaultValues: EMPTY,
  });

  const handleAdd = handleSubmit(async (values) => {
    try {
      await onAdd(values);
    } catch {
      // Keep the user's input and the form open when the save fails.
      return;
    }
    reset(EMPTY);
    onClose();
  });

  return (
    <form onSubmit={handleAdd} className="flex flex-col gap-3">
      {/* No "Linked party ID" input: the party link is system-managed and only
          set for rows derived from the Interested Parties Register. */}
      <Field>
        <Controller
          control={control}
          name="partyName"
          render={({ field: { ref: _ref, ...field } }) => (
            <Input {...field} placeholder="Interested party" aria-label="New requirement party" />
          )}
        />
        <FieldError>{errors.partyName?.message}</FieldError>
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field>
          <Controller
            control={control}
            name="requirement"
            render={({ field: { ref: _ref, ...field } }) => (
              <Textarea
                {...field}
                rows={2}
                placeholder="Requirement relevant to information security"
                aria-label="New requirement description"
              />
            )}
          />
          <FieldError>{errors.requirement?.message}</FieldError>
        </Field>
        <Field>
          <Controller
            control={control}
            name="treatment"
            render={({ field: { ref: _ref, ...field } }) => (
              <Textarea
                {...field}
                rows={2}
                placeholder="How the ISMS addresses this requirement"
                aria-label="New requirement treatment"
              />
            )}
          />
          <FieldError>{errors.treatment?.message}</FieldError>
        </Field>
      </div>
      <RequirementOwnerFields control={control} memberOptions={memberOptions} />
      <HStack justify="end">
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={isSubmitting}
          disabled={isSubmitting}
          iconLeft={<Add size={16} />}
        >
          Add requirement
        </Button>
      </HStack>
    </form>
  );
}
