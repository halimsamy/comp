'use client';

import type { Control, FieldErrors } from 'react-hook-form';
import { WizardStepCertificate } from './WizardStepCertificate';
import { WizardStepCommitments } from './WizardStepCommitments';
import { WizardStepOutcomes } from './WizardStepOutcomes';
import { WizardStepPrivacy } from './WizardStepPrivacy';
import { WizardStepScope } from './WizardStepScope';
import type { WizardDefaults, WizardFormValues } from './wizard-types';

interface WizardStepContentProps {
  stepId: string;
  control: Control<WizardFormValues>;
  errors: FieldErrors<WizardFormValues>;
  defaults: WizardDefaults;
  organizationId: string;
  /** Rows in the 6.2 Objectives register (objectives are edited there once any exist). */
  objectiveRowCount: number;
}

/** Renders the step body for the active step id. Keeps the orchestrator small. */
export function WizardStepContent({
  stepId,
  control,
  errors,
  defaults,
  organizationId,
  objectiveRowCount,
}: WizardStepContentProps) {
  switch (stepId) {
    case 'commitments':
      return (
        <WizardStepCommitments
          control={control}
          regulatorOptions={defaults.sectorRegulatorOptions}
        />
      );
    case 'scope':
      return <WizardStepScope control={control} defaults={defaults} />;
    case 'privacy':
      return <WizardStepPrivacy control={control} />;
    case 'certificate':
      return <WizardStepCertificate control={control} errors={errors} />;
    case 'outcomes':
      return (
        <WizardStepOutcomes
          control={control}
          organizationId={organizationId}
          objectiveRowCount={objectiveRowCount}
        />
      );
    default:
      return null;
  }
}
