'use client';

import { useOrganizationMutations } from '@/hooks/use-organization-mutations';
import { usePermissions } from '@/hooks/use-permissions';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  SettingsCard,
  Textarea,
} from '@trycompai/design-system';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

export const companyDetailsSchema = z.object({
  legalName: z.string().trim().max(200, 'Use at most 200 characters'),
  registeredAddress: z.string().trim().max(500, 'Use at most 500 characters'),
  phone: z
    .string()
    .trim()
    .max(40, 'Use at most 40 characters')
    .regex(/^$|^\+?[0-9 ().-]{6,}$/, 'Enter a phone number, e.g. +44 20 7946 0000'),
});

export type CompanyDetails = z.infer<typeof companyDetailsSchema>;

/** Legal name, registered address and phone, used on ISMS and SoA document headers. */
export function UpdateOrganizationCompanyDetails({
  initialValues,
}: {
  initialValues: {
    legalName: string | null;
    registeredAddress: string | null;
    phone: string | null;
  };
}) {
  const { updateOrganization } = useOrganizationMutations();
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('organization', 'update');

  const form = useForm<CompanyDetails>({
    resolver: zodResolver(companyDetailsSchema),
    defaultValues: {
      legalName: initialValues.legalName ?? '',
      registeredAddress: initialValues.registeredAddress ?? '',
      phone: initialValues.phone ?? '',
    },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const handleSave = async (data: CompanyDetails) => {
    try {
      await updateOrganization(data);
      form.reset(data);
      toast.success('Company details updated');
    } catch {
      toast.error('Could not update company details');
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleSave)} noValidate>
      <SettingsCard
        title="Company details"
        description="Your registered company details, shown on ISMS documents, the Statement of Applicability and auditor exports."
        action={
          <Button
            type="submit"
            disabled={!canUpdate || isSubmitting || !isDirty}
            loading={isSubmitting}
          >
            Save
          </Button>
        }
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="company-legal-name">Legal name</FieldLabel>
            <Input
              id="company-legal-name"
              placeholder="Acme Payments Ltd"
              disabled={!canUpdate}
              aria-invalid={!!errors.legalName}
              {...form.register('legalName')}
            />
            <FieldError errors={[errors.legalName]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-address">Registered address</FieldLabel>
            <Textarea
              id="company-address"
              rows={3}
              placeholder="1 Main Street, London EC1A 1AA, United Kingdom"
              disabled={!canUpdate}
              aria-invalid={!!errors.registeredAddress}
              {...form.register('registeredAddress')}
            />
            <FieldError errors={[errors.registeredAddress]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="company-phone">Phone</FieldLabel>
            <Input
              id="company-phone"
              type="tel"
              placeholder="+44 20 7946 0000"
              disabled={!canUpdate}
              aria-invalid={!!errors.phone}
              {...form.register('phone')}
            />
            <FieldDescription>Include the country code.</FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>
        </FieldGroup>
      </SettingsCard>
    </form>
  );
}
