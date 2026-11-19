'use client';

import { Section, Text } from '@trycompai/design-system';
import Link from 'next/link';
import { Controller, type Control } from 'react-hook-form';
import { WizardEditableList } from './WizardEditableList';
import { WizardField } from './WizardField';
import { WizardObjectivesEditor } from './WizardObjectivesEditor';
import type { WizardFormValues } from './wizard-types';

interface WizardStepOutcomesProps {
  control: Control<WizardFormValues>;
  organizationId: string;
  /** Once the 6.2 register has rows, objectives are edited there, not here. */
  objectiveRowCount: number;
}

function ObjectivesManagedIn62({
  organizationId,
  count,
}: {
  organizationId: string;
  count: number;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <Text size="sm" variant="muted">
        Your {count} objective{count === 1 ? '' : 's'} live in the 6.2 Objectives register, so they
        are not edited here.
      </Text>
      <Link
        href={`/${organizationId}/documents/isms/objectives`}
        className="shrink-0 text-sm text-primary hover:underline"
      >
        Edit in 6.2 Objectives →
      </Link>
    </div>
  );
}

/**
 * Final step — Targets & outcomes.
 * Q11: confirm/override the default information security objectives & targets.
 * Q12: confirm/override the default intended outcomes of the ISMS.
 */
export function WizardStepOutcomes({
  control,
  organizationId,
  objectiveRowCount,
}: WizardStepOutcomesProps) {
  return (
    <Section
      title="Targets & outcomes"
      description="The measurable objectives and intended outcomes your ISMS is built to achieve."
      gap="8"
    >
      {objectiveRowCount > 0 ? (
        <WizardField label="Information security objectives & targets">
          <ObjectivesManagedIn62 organizationId={organizationId} count={objectiveRowCount} />
        </WizardField>
      ) : (
        <Controller
          control={control}
          name="objectives"
          render={({ field }) => (
            <WizardField
              label="Information security objectives & targets"
              helper="Pre-filled defaults. Confirm, edit, add, or remove until they reflect your goals."
            >
              <WizardObjectivesEditor items={field.value ?? []} onChange={field.onChange} />
            </WizardField>
          )}
        />
      )}

      <Controller
        control={control}
        name="intendedOutcomes"
        render={({ field }) => {
          const items = Array.isArray(field.value) ? field.value : [];
          return (
            <WizardField
              label="Intended outcomes of the ISMS"
              helper="The outcomes your ISMS is meant to achieve. Confirm or adjust the defaults."
            >
              <WizardEditableList
                label="Intended outcomes"
                items={items}
                emptyText="No intended outcomes yet. Add at least one."
                onAdd={(item) => field.onChange([...items, item])}
                onRemove={(index) => field.onChange(items.filter((_, i) => i !== index))}
              />
            </WizardField>
          );
        }}
      />
    </Section>
  );
}
