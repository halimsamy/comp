'use client';

import type { AccessAccount } from '@/hooks/use-access-reviews';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@trycompai/design-system';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

export interface OwnerOption {
  id: string;
  label: string;
}

const ownerSchema = z
  .object({
    mode: z.enum(['member', 'service', 'none']),
    memberId: z.string(),
    justification: z.string().max(500),
  })
  .refine((v) => v.mode !== 'member' || v.memberId !== '', {
    message: 'Pick the member who owns this account',
    path: ['memberId'],
  })
  .refine((v) => v.mode !== 'service' || v.justification.trim() !== '', {
    message: 'Explain what the service account is used for',
    path: ['justification'],
  });
export type OwnerValues = z.infer<typeof ownerSchema>;

const MODE_LABEL: Record<OwnerValues['mode'], string> = {
  member: 'A member',
  service: 'Service account (no person)',
  none: 'Clear the mapping',
};

function defaults(account: AccessAccount | null): OwnerValues {
  if (account?.isServiceAccount) {
    return { mode: 'service', memberId: '', justification: account.justification ?? '' };
  }
  return { mode: 'member', memberId: account?.owner?.memberId ?? '', justification: '' };
}

/** Map an account to its owner, or mark it a service account with a reason. */
export function AccountOwnerDialog({
  account,
  members,
  onOpenChange,
  onSave,
}: {
  account: AccessAccount | null;
  members: OwnerOption[];
  onOpenChange: (open: boolean) => void;
  onSave: (values: OwnerValues) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OwnerValues>({ resolver: zodResolver(ownerSchema), values: defaults(account) });
  const mode = watch('mode');

  const handleSave = handleSubmit(async (values) => {
    await onSave(values);
    onOpenChange(false);
  });

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Account owner</DialogTitle>
          <DialogDescription>
            {account?.name}
            {account?.email && account.email !== account.name ? ` (${account.email})` : ''}. Every
            account needs an owner so access can be reviewed (ISO 27001 A.5.18).
          </DialogDescription>
        </DialogHeader>
        <form id="account-owner-form" onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="owner-mode">Owned by</Label>
            <Controller
              control={control}
              name="mode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(value) => field.onChange(value ?? 'member')}>
                  <SelectTrigger id="owner-mode" aria-label="Owned by">
                    <SelectValue>{(value: OwnerValues['mode']) => MODE_LABEL[value]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODE_LABEL) as OwnerValues['mode'][]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {MODE_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {mode === 'member' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="owner-member">Member</Label>
              <Controller
                control={control}
                name="memberId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => field.onChange(value ?? '')}>
                    <SelectTrigger id="owner-member" aria-label="Member">
                      <SelectValue placeholder="Select a member">
                        {(value: string) => members.find((m) => m.id === value)?.label ?? 'Select a member'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.memberId && (
                <span role="alert" className="text-xs text-destructive">
                  {errors.memberId.message}
                </span>
              )}
            </div>
          )}
          {mode === 'service' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="owner-justification">What is it used for?</Label>
              <Controller
                control={control}
                name="justification"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Textarea {...field} id="owner-justification" rows={3} placeholder="CI deploys to production" />
                )}
              />
              {errors.justification && (
                <span role="alert" className="text-xs text-destructive">
                  {errors.justification.message}
                </span>
              )}
            </div>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="account-owner-form" loading={isSubmitting}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
