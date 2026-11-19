'use client';

import { apiClient } from '@/lib/api-client';
import { APPLICABILITY_LABELS } from '@/lib/control-compliance';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@trycompai/design-system';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  APPLICABILITY_HELP,
  type ApplicabilityForm,
  type ApplicabilityRules,
  applicabilityFormSchema,
  buildApplicabilityPayload,
} from './applicability-schema';
import { ApplicabilityTextField } from './ApplicabilityTextField';
import { CompensatingControlFields, type ControlOption } from './CompensatingControlFields';
import { CustomizedApproachFields } from './CustomizedApproachFields';

export function RequirementApplicabilitySheet({
  open,
  onOpenChange,
  frameworkInstanceId,
  requirementKey,
  rules,
  defaultValues,
  childCount = 0,
  controlOptions = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameworkInstanceId: string;
  requirementKey: string;
  rules: ApplicabilityRules;
  defaultValues: ApplicabilityForm;
  /** Sub-requirements (identifier prefix) that "Apply to sub-requirements" would also mark. */
  childCount?: number;
  controlOptions?: ControlOption[];
}) {
  const router = useRouter();
  const form = useForm<ApplicabilityForm>({
    resolver: zodResolver(applicabilityFormSchema),
    values: defaultValues,
  });
  const { isSubmitting } = form.formState;
  const status = form.watch('status');

  const handleSubmit = form.handleSubmit(async (values) => {
    const response = await apiClient.put<{ cascaded?: number }>(
      `/v1/frameworks/${frameworkInstanceId}/requirements/${requirementKey}/applicability`,
      buildApplicabilityPayload(values),
    );
    if (response.error) {
      toast.error(response.error);
      return;
    }
    const cascaded = response.data?.cascaded ?? 0;
    toast.success(
      cascaded > 0
        ? `Applicability saved for this requirement and ${cascaded} sub-requirements`
        : 'Applicability saved',
    );
    onOpenChange(false);
    router.refresh();
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Applicability</SheetTitle>
          <SheetDescription>
            {rules.managedBy === 'soa'
              ? 'Saved to the Statement of Applicability, the source of truth for Annex A.'
              : 'Decide whether this requirement applies. Not applicable requirements are excluded from the framework score.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} aria-label="Status">
                  {rules.allowedStatuses.map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                    >
                      <RadioGroupItem value={option} />
                      <div className="flex flex-col gap-0.5">
                        <Text size="sm" weight="medium">
                          {APPLICABILITY_LABELS[option]}
                        </Text>
                        <Text size="xs" variant="muted">
                          {APPLICABILITY_HELP[option]}
                        </Text>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
            {rules.reason && (
              <Text size="xs" variant="muted">
                {rules.reason}
              </Text>
            )}
            {status !== 'applicable' && (
              <ApplicabilityTextField
                form={form}
                name="justification"
                label="Justification"
                rows={5}
                placeholder="e.g., No wireless networks connect to or are in the CDE."
              />
            )}
            {status === 'not_applicable' && childCount > 0 && rules.managedBy !== 'soa' && (
              <Controller
                control={form.control}
                name="applyToChildren"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                    <span className="text-sm">{`Apply to sub-requirements (${childCount})`}</span>
                  </label>
                )}
              />
            )}
            {status === 'compensating_control' && (
              <CompensatingControlFields form={form} controlOptions={controlOptions} />
            )}
            {status === 'customized_approach' && <CustomizedApproachFields form={form} />}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Save
              </Button>
            </div>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
