'use client';

import { type ComponentProps, useState } from 'react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { Button, Section, Stack, Switch, Text } from '@trycompai/design-system';
import { PortalSettings } from '../../../settings/portal/portal-settings';
import { OffboardingChecklistSettings } from './OffboardingChecklistSettings';
import { ReminderSettings } from './ReminderSettings';
import { VerifyExternallyDialog } from './VerifyExternallyDialog';
import { TrainingModulesSettings } from './TrainingModulesSettings';
import { TrainingRecordsSettings } from './TrainingRecordsSettings';

interface PeopleSettingsProps {
  backgroundCheckStepEnabled: boolean;
  /** #98: employee portal toggles, moved here from Settings > Portal. */
  portal?: ComponentProps<typeof PortalSettings>;
}

export function PeopleSettings({
  backgroundCheckStepEnabled: initialEnabled,
  portal,
}: PeopleSettingsProps) {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('organization', 'update');
  const canVerify = hasPermission('member', 'update');
  const [verifyOpen, setVerifyOpen] = useState(false);

  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const handleToggle = async (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setSaving(true);

    const res = await apiClient.patch('/v1/organization', {
      backgroundCheckStepEnabled: next,
    });

    setSaving(false);

    if (res.error) {
      setEnabled(previous);
      toast.error('Failed to update background check setting');
      return;
    }

    toast.success(
      next
        ? 'Background checks now required'
        : 'Background checks bypassed for your organization',
    );
  };

  return (
    <Stack gap="lg">
      <Section
        title="Background checks"
        actions={
          canVerify ? (
            <Button size="sm" variant="outline" onClick={() => setVerifyOpen(true)}>
              Record checks done elsewhere
            </Button>
          ) : undefined
        }
      >
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="flex-1">
            <Text weight="medium">Require background checks</Text>
            <Text size="sm" variant="muted">
              When off, your organization&apos;s members do not need to pass a
              background check to count toward people completion. Individual
              members can also be exempted from their profile.
            </Text>
          </div>
          <Switch
            checked={enabled}
            disabled={saving || !canUpdate}
            onCheckedChange={handleToggle}
            aria-label="Require background checks"
          />
        </div>
        <VerifyExternallyDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
      </Section>
      {portal && (
        <Section title="Employee portal">
          <PortalSettings {...portal} />
        </Section>
      )}
      <ReminderSettings />
      <OffboardingChecklistSettings kind="onboarding" />
      <OffboardingChecklistSettings />
      <TrainingModulesSettings />
      <TrainingRecordsSettings />
    </Stack>
  );
}
