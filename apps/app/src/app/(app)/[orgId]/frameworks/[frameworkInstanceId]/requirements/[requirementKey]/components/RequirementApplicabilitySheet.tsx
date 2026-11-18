'use client';

import { apiClient } from '@/lib/api-client';
import { APPLICABILITY_LABELS } from '@/lib/control-compliance';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  APPLICABILITY_HELP,
  type ApplicabilityForm,
  type ApplicabilityRules,
  applicabilityFormSchema,
} from './applicability-schema';

export function RequirementApplicabilitySheet({
  open,
  onOpenChange,
  frameworkInstanceId,
  requirementKey,
  rules,
  defaultValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameworkInstanceId: string;
  requirementKey: string;
  rules: ApplicabilityRules;
  defaultValues: ApplicabilityForm;
}) {
  const router = useRouter();
  const form = useForm<ApplicabilityForm>({
    resolver: zodResolver(applicabilityFormSchema),
    values: defaultValues,
  });
  const { errors, isSubmitting } = form.formState;

  const handleSubmit = form.handleSubmit(async (values) => {
    const response = await apiClient.put(
      `/v1/frameworks/${frameworkInstanceId}/requirements/${requirementKey}/applicability`,
      { status: values.status, justification: values.justification.trim() || undefined },
    );
    if (response.error) {
      toast.error(response.error);
      return;
    }
    toast.success('Applicability saved');
    onOpenChange(false);
    router.refresh();
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Applicability</SheetTitle>
          <SheetDescription>
            Decide whether this requirement applies. Not applicable requirements are excluded
            from the framework score.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} aria-label="Status">
                  {rules.allowedStatuses.map((status) => (
                    <label
                      key={status}
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                    >
                      <RadioGroupItem value={status} />
                      <div className="flex flex-col gap-0.5">
                        <Text size="sm" weight="medium">
                          {APPLICABILITY_LABELS[status]}
                        </Text>
                        <Text size="xs" variant="muted">
                          {APPLICABILITY_HELP[status]}
                        </Text>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="applicability-justification">Justification</Label>
              <Textarea
                id="applicability-justification"
                rows={5}
                placeholder="e.g., No wireless networks connect to or are in the CDE."
                {...form.register('justification')}
              />
              {errors.justification && (
                <Text size="xs" variant="destructive">
                  {errors.justification.message}
                </Text>
              )}
            </div>
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
