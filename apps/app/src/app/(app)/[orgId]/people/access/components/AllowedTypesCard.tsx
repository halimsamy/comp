'use client';

import type { AccessSystem } from '@/hooks/use-access-reviews';
import { type AccountTypeKey, useAccessRoleMutations } from '@/hooks/use-access-roles';
import { Button, Input, Label, Switch, Text } from '@trycompai/design-system';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const TYPES: { key: AccountTypeKey; label: string }[] = [
  { key: 'human', label: 'Personal accounts' },
  { key: 'service', label: 'Service accounts' },
  { key: 'shared', label: 'Shared accounts' },
];

type TypeState = Record<AccountTypeKey, { allowed: boolean; justification: string }>;

const toState = (system: AccessSystem): TypeState =>
  Object.fromEntries(
    TYPES.map(({ key }) => [
      key,
      {
        allowed: system.allowedAccountTypes?.[key]?.allowed ?? true,
        justification: system.allowedAccountTypes?.[key]?.justification ?? '',
      },
    ]),
  ) as TypeState;

/** #177: which account types a manual system allows; accounts of other types are flagged. */
export function AllowedTypesCard({
  system,
  canEdit,
  onSaved,
}: {
  system: AccessSystem;
  canEdit: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const { setAllowedTypes } = useAccessRoleMutations();
  const [state, setState] = useState<TypeState>(() => toState(system));
  const [saving, setSaving] = useState(false);
  useEffect(() => setState(toState(system)), [system]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setAllowedTypes({
        systemId: system.key.slice('manual:'.length),
        types: TYPES.map(({ key }) => ({
          type: key,
          allowed: state[key].allowed,
          justification: state[key].justification.trim() || undefined,
        })),
      });
      await onSaved();
      toast.success('Account types saved');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to save account types');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <Text size="sm" weight="medium">
        Allowed account types · {system.name}
      </Text>
      {TYPES.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex w-full items-center gap-2 sm:w-[200px]">
            <Switch
              id={`type-${system.key}-${key}`}
              checked={state[key].allowed}
              disabled={!canEdit}
              onCheckedChange={(allowed) => setState((s) => ({ ...s, [key]: { ...s[key], allowed } }))}
            />
            <Label htmlFor={`type-${system.key}-${key}`}>{label}</Label>
          </div>
          <Input
            value={state[key].justification}
            disabled={!canEdit}
            aria-label={`${label} justification`}
            placeholder={key === 'human' ? 'Optional' : 'Why this account type is needed'}
            onChange={(e) => {
              const justification = e.target.value;
              setState((s) => ({ ...s, [key]: { ...s[key], justification } }));
            }}
          />
        </div>
      ))}
      {canEdit && (
        <div>
          <Button size="sm" onClick={() => void handleSave()} loading={saving}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
