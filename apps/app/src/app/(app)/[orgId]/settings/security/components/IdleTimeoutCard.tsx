'use client';

import type { SecuritySettings, SecuritySettingsUpdate } from '@/hooks/use-security-settings';
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsCard,
} from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';
import { idleTimeoutLabel, meetsPciIdleTimeout } from './security-options';

const OFF = 'off';

export function IdleTimeoutCard({
  settings,
  canEdit,
  onUpdate,
}: {
  settings: SecuritySettings;
  canEdit: boolean;
  onUpdate: (patch: SecuritySettingsUpdate) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const current = settings.sessionIdleTimeoutMinutes;
  const value = current ? String(current) : OFF;

  const handleChange = async (next: string | null) => {
    if (!next || next === value) return;
    setSaving(true);
    try {
      await onUpdate({ sessionIdleTimeoutMinutes: next === OFF ? null : Number(next) });
      toast.success('Idle session timeout updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update the idle timeout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      title="Idle session timeout"
      description="Sign members out of the app after a period of inactivity. The API ends idle sessions too, so a closed laptop can't be reused."
      hint={
        meetsPciIdleTimeout(current) ? (
          <Badge variant="accent">Meets PCI DSS 8.2.8</Badge>
        ) : (
          'PCI DSS 8.2.8 requires re-authentication after 15 minutes of inactivity.'
        )
      }
    >
      <div className="w-full sm:w-[280px]">
        <Select value={value} onValueChange={handleChange} disabled={!canEdit || saving}>
          <SelectTrigger aria-label="Idle session timeout">
            <SelectValue>{idleTimeoutLabel(current)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OFF}>{idleTimeoutLabel(null)}</SelectItem>
            {settings.idleTimeoutOptions.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)}>
                {idleTimeoutLabel(minutes)}
                {meetsPciIdleTimeout(minutes) ? ' (PCI DSS)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </SettingsCard>
  );
}
