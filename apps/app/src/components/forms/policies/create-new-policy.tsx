'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { usePolicyMutations } from '@/hooks/use-policy-mutations';
import { createPolicySchema } from '@/actions/schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Label, Stack, Text, Textarea } from '@trycompai/design-system';
import { ArrowRight } from '@trycompai/design-system/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreatePolicyOwnershipFields } from './create-policy-ownership-fields';

export const REVIEW_FREQUENCIES = ['monthly', 'quarterly', 'semiannually', 'yearly'] as const;

const createPolicyFormSchema = createPolicySchema.extend({
  ownerId: z.string().nullable(),
  approverId: z.string().nullable(),
  frequency: z.enum(REVIEW_FREQUENCIES),
});

export type CreatePolicyFormValues = z.infer<typeof createPolicyFormSchema>;

export function CreateNewPolicyForm() {
  const { hasPermission } = usePermissions();
  const { createPolicy } = usePolicyMutations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const closeSheet = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('create-policy-sheet');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreatePolicyFormValues>({
    resolver: zodResolver(createPolicyFormSchema),
    defaultValues: {
      title: '',
      description: '',
      ownerId: null,
      approverId: null,
      frequency: 'yearly',
    },
  });

  const onSubmit = async (data: CreatePolicyFormValues) => {
    setIsLoading(true);
    try {
      await createPolicy({
        name: data.title,
        description: data.description,
        content: [],
        frequency: data.frequency,
        // The API makes the creator the owner when none is picked.
        ...(data.ownerId && { assigneeId: data.ownerId }),
        ...(data.approverId && { approverId: data.approverId }),
      });
      toast.success('Policy successfully created');
      closeSheet();
    } catch {
      toast.error('Failed to create policy');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Stack gap="md">
        <Stack gap="xs">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            {...register('title')}
            autoFocus
            placeholder="Policy title"
            autoCorrect="off"
          />
          {errors.title && (
            <Text size="sm" variant="destructive">
              {errors.title.message}
            </Text>
          )}
        </Stack>

        <Stack gap="xs">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            {...register('description')}
            placeholder="Brief description of the policy"
            rows={4}
          />
          {errors.description && (
            <Text size="sm" variant="destructive">
              {errors.description.message}
            </Text>
          )}
        </Stack>

        <CreatePolicyOwnershipFields control={control} />

        <Button iconRight={<ArrowRight />} loading={isLoading} disabled={!hasPermission('policy', 'create')} onClick={handleSubmit(onSubmit)}>
          Create
        </Button>
      </Stack>
    </form>
  );
}
