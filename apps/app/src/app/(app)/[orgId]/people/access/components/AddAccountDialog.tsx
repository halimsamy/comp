'use client';

import type { AccessAccount, ImportedAccount } from '@/hooks/use-access-reviews';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@trycompai/design-system';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

const accountSchema = z.object({
  accountId: z.string().trim().min(1, 'Enter the username or email').max(320),
  name: z.string().max(200),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]),
  roles: z.string().max(1000),
  type: z.enum(['human', 'service', 'shared']),
  mfa: z.enum(['unknown', 'on', 'off']),
  isAdmin: z.boolean(),
});
type AccountValues = z.infer<typeof accountSchema>;
const EMPTY: AccountValues = { accountId: '', name: '', email: '', roles: '', type: 'human', mfa: 'unknown', isAdmin: false };

const TYPE_LABEL = { human: 'Person', service: 'Service account', shared: 'Shared account' };
const MFA_LABEL = { unknown: 'Unknown', on: 'On', off: 'Off' };

const TYPES = ['human', 'service', 'shared'] as const;
const STATUSES = ['active', 'suspended', 'deactivated'] as const;
const pick = <T extends string>(options: readonly T[], value: string | null): T | undefined =>
  options.find((o) => o === value);

/** Form values for editing an existing account. */
export function toAccountValues(account: AccessAccount): AccountValues {
  return {
    accountId: account.accountId,
    name: account.name === account.accountId ? '' : account.name,
    email: account.email ?? '',
    roles: account.roles.join(', '),
    type: pick(TYPES, account.type) ?? 'human',
    mfa: account.mfaEnabled === null ? 'unknown' : account.mfaEnabled ? 'on' : 'off',
    isAdmin: account.isAdmin,
  };
}

/** `existing` keeps what the form doesn't edit (status, last login, created date). */
export function toImportedAccount(values: AccountValues, existing?: AccessAccount | null): ImportedAccount {
  const email = values.email.trim() || (values.accountId.includes('@') ? values.accountId.trim() : '');
  return {
    ...(existing && {
      status: pick(STATUSES, existing.status),
      lastLoginAt: existing.lastLoginAt ?? undefined,
      createdAt: existing.accountCreatedAt ?? undefined,
    }),
    accountId: values.accountId.trim(),
    name: values.name.trim() || undefined,
    email: email || undefined,
    type: values.type,
    roles: values.roles.split(/[;,]/).map((r) => r.trim()).filter(Boolean),
    isAdmin: values.isAdmin,
    mfaEnabled: values.mfa === 'unknown' ? undefined : values.mfa === 'on',
  };
}

/** Add one account to a manual system, or edit one (`account` set), without re-importing the CSV. */
export function AddAccountDialog({
  systemName,
  account,
  open,
  onOpenChange,
  onSave,
}: {
  systemName: string;
  account?: AccessAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (account: ImportedAccount) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountValues>({ resolver: zodResolver(accountSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) reset(account ? toAccountValues(account) : EMPTY);
  }, [open, account, reset]);

  const handleSave = handleSubmit(async (values) => {
    await onSave(toImportedAccount(values, account));
    onOpenChange(false);
  });

  const text = (name: 'accountId' | 'name' | 'email' | 'roles', label: string, placeholder: string, disabled = false) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`account-${name}`}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field: { ref: _ref, ...field } }) => <Input {...field} id={`account-${name}`} placeholder={placeholder} disabled={disabled} />}
      />
      {errors[name] && (
        <span role="alert" className="text-xs text-destructive">
          {errors[name]?.message}
        </span>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{account ? `Edit ${account.accountId}` : `Add an account to ${systemName}`}</DialogTitle>
          <DialogDescription>
            {account
              ? 'The username can’t change; remove the account and add it again instead.'
              : 'The account is matched to a member by email. Adding an existing username updates it.'}
          </DialogDescription>
        </DialogHeader>
        <form id="add-account-form" onSubmit={handleSave} className="flex flex-col gap-4">
          {text('accountId', 'Username or email', 'jane@acme.com', Boolean(account))}
          <div className="grid gap-4 sm:grid-cols-2">
            {text('name', 'Name (optional)', 'Jane Doe')}
            {text('email', 'Email (optional)', 'jane@acme.com')}
          </div>
          {text('roles', 'Roles (optional, comma separated)', 'Approver, Reports')}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                    <SelectTrigger aria-label="Type">
                      <SelectValue>{(value: keyof typeof TYPE_LABEL) => TYPE_LABEL[value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>MFA</Label>
              <Controller
                control={control}
                name="mfa"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                    <SelectTrigger aria-label="MFA">
                      <SelectValue>{(value: keyof typeof MFA_LABEL) => MFA_LABEL[value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MFA_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={control}
              name="isAdmin"
              render={({ field }) => (
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              )}
            />
            Has administrator rights
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-account-form" loading={isSubmitting}>
            {account ? 'Save changes' : 'Add account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
