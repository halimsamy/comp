'use client';

import type { SecuritySettings, SecuritySettingsUpdate } from '@/hooks/use-security-settings';
import { Badge, Checkbox, SettingsCard, Switch, Text } from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';

export function SignInMethodsCard({
  settings,
  canEdit,
  onUpdate,
}: {
  settings: SecuritySettings;
  canEdit: boolean;
  onUpdate: (patch: SecuritySettingsUpdate) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const allowed = settings.allowedSignInMethods;
  const restricted = allowed.length > 0;

  const save = async (next: string[]) => {
    setSaving(true);
    try {
      await onUpdate({ allowedSignInMethods: next });
      toast.success('Sign-in methods updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update sign-in methods');
    } finally {
      setSaving(false);
    }
  };

  const handleRestrictChange = (checked: boolean) => {
    // Restricting starts from every method, so nobody is locked out until boxes are cleared.
    void save(checked ? settings.availableSignInMethods.map((m) => m.id) : []);
  };

  const handleMethodChange = (method: string, checked: boolean) => {
    const next = checked ? [...allowed, method] : allowed.filter((m) => m !== method);
    if (next.length === 0) {
      toast.error('Keep at least one sign-in method, or turn off the restriction.');
      return;
    }
    void save(next);
  };

  return (
    <SettingsCard
      title="Allowed sign-in methods"
      description="Choose how members may sign in, for example only with your Google Workspace or Microsoft accounts. Members using another method are asked to sign in again."
      hint={restricted ? <Badge variant="accent">Restricted</Badge> : 'All methods are allowed.'}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <Text weight="medium">Restrict sign-in methods</Text>
          <Switch
            checked={restricted}
            onCheckedChange={handleRestrictChange}
            disabled={!canEdit || saving}
            aria-label="Restrict sign-in methods"
          />
        </div>
        {restricted && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {settings.availableSignInMethods.map((method) => (
              <label
                key={method.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <Checkbox
                  checked={allowed.includes(method.id)}
                  onCheckedChange={(checked) => handleMethodChange(method.id, checked === true)}
                  disabled={!canEdit || saving}
                  aria-label={method.label}
                />
                <Text size="sm">{capitalize(method.label)}</Text>
              </label>
            ))}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
