'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Field,
  FieldError,
  Heading,
  HStack,
  Stack,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { Edit } from '@trycompai/design-system/icons';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { parseProgramme } from './internal-audit-constants';
import { GoverningPolicyPicker, parseGoverningPolicyId } from './GoverningPolicyPicker';
import { IsmsRegisterCard } from './shared';

const programmeSchema = z.object({
  programme: z.string().trim().min(1, 'The programme paragraph is required'),
});

type ProgrammeFormValues = z.infer<typeof programmeSchema>;

interface ProgrammeCardProps {
  narrative: unknown;
  canEdit: boolean;
  /** Saves the whole narrative: the paragraph plus the optional policy link. */
  onSave: (narrative: { programme: string; governingPolicyId?: string }) => Promise<void>;
}

/**
 * The audit Programme paragraph (top of the Internal Audit page). Ships with a
 * hardcoded default and is rendered verbatim into the generated clause-9.2
 * document; the customer edits it in place.
 */
export function ProgrammeCard({ narrative, canEdit, onSave }: ProgrammeCardProps) {
  const programme = parseProgramme(narrative);
  const policyId = parseGoverningPolicyId(narrative);
  const [isEditing, setIsEditing] = useState(false);
  // The paragraph is kept while linked, so unlinking restores it.
  const save = ({ text, link }: { text: string; link: string | null }) =>
    onSave({ programme: text, ...(link ? { governingPolicyId: link } : {}) });

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isValid, isSubmitting },
  } = useForm<ProgrammeFormValues>({
    resolver: zodResolver(programmeSchema),
    mode: 'onChange',
    defaultValues: { programme },
  });

  useEffect(() => {
    if (!isEditing) reset({ programme });
  }, [programme, isEditing, reset]);

  const handleSave = handleSubmit(async (values) => {
    try {
      await save({ text: values.programme.trim(), link: policyId });
    } catch {
      return;
    }
    setIsEditing(false);
  });

  const headerActions = canEdit && !policyId ? (
    isEditing ? (
      <HStack align="center" gap="2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            reset({ programme });
            setIsEditing(false);
          }}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleSave}
          disabled={!isDirty || !isValid || isSubmitting}
          loading={isSubmitting}
        >
          Save
        </Button>
      </HStack>
    ) : (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setIsEditing(true)}
        iconLeft={<Edit size={16} />}
        aria-label="Edit programme"
      >
        Edit
      </Button>
    )
  ) : undefined;

  return (
    <IsmsRegisterCard
      header={
        <Stack gap="1">
          <Heading level="4">Programme</Heading>
          <Text size="sm" variant="muted">
            {policyId
              ? 'The generated Clause 9.2 document references the linked policy.'
              : 'Rendered verbatim into the generated Clause 9.2 document.'}
          </Text>
        </Stack>
      }
      headerEnd={headerActions}
    >
      <Stack gap="4">
        <GoverningPolicyPicker
          policyId={policyId}
          canEdit={canEdit}
          paragraphName="programme"
          onChange={(link) => save({ text: programme, link })}
        />
        {policyId ? null : isEditing ? (
          <Field>
            <Controller
              control={control}
              name="programme"
              render={({ field: { ref: _ref, ...field }, fieldState }) => (
                <>
                  <Textarea {...field} rows={4} aria-label="Audit programme" />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </>
              )}
            />
          </Field>
        ) : (
          // whitespace-pre-wrap inherits into the Text span, preserving the
          // paragraph breaks a multi-line programme was written with.
          <div className="whitespace-pre-wrap">
            <Text size="sm">{programme || 'No programme recorded yet.'}</Text>
          </div>
        )}
      </Stack>
    </IsmsRegisterCard>
  );
}
