'use client';

import { Button, Checkbox, HStack, Section, Stack, Text } from '@trycompai/design-system';
import { Locked } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { useEmailPreferences, type DigestFrequency } from '../hooks/useEmailPreferences';
import { DigestFrequencySelect } from './DigestFrequencySelect';

interface EmailPreferences {
  policyNotifications: boolean;
  taskReminders: boolean;
  weeklyTaskDigest: boolean;
  unassignedItemsNotifications: boolean;
  taskMentions: boolean;
  taskAssignments: boolean;
  complianceDigest: boolean;
  ownershipAssignments: boolean;
  slaAlerts: boolean;
}

// Keys added after users first saved preferences default to on.
const NEW_KEY_DEFAULTS = { complianceDigest: true, ownershipAssignments: true, slaAlerts: true };

interface RoleNotifications {
  policyNotifications: boolean;
  taskReminders: boolean;
  taskAssignments: boolean;
  taskMentions: boolean;
  weeklyTaskDigest: boolean;
  findingNotifications: boolean;
  complianceDigest?: boolean;
  ownershipAssignments?: boolean;
  slaAlerts?: boolean;
}

interface Props {
  initialPreferences: Omit<EmailPreferences, keyof typeof NEW_KEY_DEFAULTS> &
    Partial<EmailPreferences> & {
      digestFrequency?: DigestFrequency;
      complianceDigestFrequency?: DigestFrequency;
    };
  email: string;
  isAdminOrOwner?: boolean;
  roleNotifications?: RoleNotifications | null;
}

const NOTIFICATION_ITEMS: {
  key: keyof EmailPreferences;
  roleKey?: keyof RoleNotifications;
  label: string;
  description: string;
}[] = [
  {
    key: 'policyNotifications',
    roleKey: 'policyNotifications',
    label: 'Policy Notifications',
    description: 'Receive emails when new policies are published or existing policies are updated',
  },
  {
    key: 'taskReminders',
    roleKey: 'taskReminders',
    label: 'Task Reminders',
    description: 'Receive reminders when tasks are due soon or overdue',
  },
  {
    key: 'weeklyTaskDigest',
    roleKey: 'weeklyTaskDigest',
    label: 'Task Digest',
    description:
      'Receive a summary of open tasks assigned to you (owners and admins also see unassigned tasks)',
  },
  {
    key: 'unassignedItemsNotifications',
    label: 'Unassigned Items Notifications',
    description: 'Receive notifications when items need reassignment after a member is removed',
  },
  {
    key: 'taskMentions',
    roleKey: 'taskMentions',
    label: 'Task Mentions',
    description: 'Receive notifications when someone mentions you in a task',
  },
  {
    key: 'taskAssignments',
    roleKey: 'taskAssignments',
    label: 'Task Assignments',
    description: 'Receive notifications when someone assigns a task to you',
  },
  {
    key: 'ownershipAssignments',
    roleKey: 'ownershipAssignments',
    label: 'Ownership',
    description: 'Receive an email when you are made owner of a risk, vendor, asset or control',
  },
  {
    key: 'slaAlerts',
    roleKey: 'slaAlerts',
    label: 'SLA Alerts',
    description:
      'Receive alerts when vulnerabilities, reviews or requests near or pass their deadline',
  },
  {
    key: 'complianceDigest',
    roleKey: 'complianceDigest',
    label: 'Compliance Digest',
    description: 'Receive a summary of what needs attention across the compliance program',
  },
];

export function EmailNotificationPreferences({
  initialPreferences,
  email,
  isAdminOrOwner = true,
  roleNotifications,
}: Props) {
  const {
    digestFrequency: initialFrequency,
    complianceDigestFrequency: initialComplianceFrequency,
    ...initialToggles
  } = initialPreferences;
  const { savePreferences } = useEmailPreferences({ initialPreferences });
  const [preferences, setPreferences] = useState<EmailPreferences>({
    ...NEW_KEY_DEFAULTS,
    ...initialToggles,
  });
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(
    initialFrequency ?? 'weekly',
  );
  const [complianceFrequency, setComplianceFrequency] = useState<DigestFrequency>(
    initialComplianceFrequency ?? 'weekly',
  );
  const [saving, setSaving] = useState(false);

  const handleToggle = (key: keyof EmailPreferences, checked: boolean) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const handleSelectAll = () => {
    const allEnabled = Object.values(preferences).every((v) => v === true);
    setPreferences((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next) as Array<keyof EmailPreferences>) {
        next[key] = !allEnabled;
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePreferences({
        ...preferences,
        digestFrequency,
        complianceDigestFrequency: complianceFrequency,
      });
      toast.success('Email preferences updated successfully');
    } catch {
      toast.error('Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  // Check if a notification is locked by role settings (non-admin users only)
  const isLocked = (item: (typeof NOTIFICATION_ITEMS)[number]): boolean => {
    if (isAdminOrOwner) return false;
    if (!roleNotifications || !item.roleKey) return false;
    return true; // Non-admin users can't change role-controlled notifications
  };

  // Get effective checked state considering role settings
  const isChecked = (item: (typeof NOTIFICATION_ITEMS)[number]): boolean => {
    if (!isAdminOrOwner && roleNotifications && item.roleKey) {
      return roleNotifications[item.roleKey] !== false;
    }
    return preferences[item.key];
  };

  const digestEnabled =
    !isAdminOrOwner && roleNotifications
      ? roleNotifications.weeklyTaskDigest
      : preferences.weeklyTaskDigest;

  const complianceDigestEnabled =
    !isAdminOrOwner && roleNotifications
      ? roleNotifications.complianceDigest !== false
      : preferences.complianceDigest;

  const description = isAdminOrOwner
    ? `Manage which email notifications you receive at ${email}.`
    : `Email notification settings for ${email}. Most settings are managed by your organization admin.`;

  return (
    <Section
      title="Email Notifications"
      description={description}
      actions={
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      }
    >
      <Stack>
        {isAdminOrOwner && (
          <HStack align="center" justify="between">
            <div>
              <Text size="base" weight="medium">
                Enable All
              </Text>
              <Text size="sm" variant="muted">
                Toggle all notifications
              </Text>
            </div>
            <Button onClick={handleSelectAll} variant="outline" size="sm">
              {Object.values(preferences).every((v) => v === true) ? 'Disable All' : 'Enable All'}
            </Button>
          </HStack>
        )}

        <Stack>
          {NOTIFICATION_ITEMS.map((item) => {
            const locked = isLocked(item);
            const checked = isChecked(item);

            return (
              <label
                key={item.key}
                className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${
                  locked ? 'opacity-60 cursor-default' : 'cursor-pointer hover:bg-muted/50'
                }`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={locked ? undefined : (c) => handleToggle(item.key, c === true)}
                  disabled={locked}
                />
                <div className="flex-1 min-w-0">
                  <HStack align="center" gap="xs">
                    <Text weight="medium">{item.label}</Text>
                    {locked && <Locked size={14} />}
                  </HStack>
                  <Text size="sm" variant="muted">
                    {item.description}
                  </Text>
                  {locked && (
                    <Text size="xs" variant="muted">
                      Managed by your organization admin
                    </Text>
                  )}
                </div>
              </label>
            );
          })}
        </Stack>

        <DigestFrequencySelect
          value={digestFrequency}
          onChange={setDigestFrequency}
          disabled={!digestEnabled}
        />
        <DigestFrequencySelect
          label="Compliance digest frequency"
          description="How often the compliance digest email is sent."
          value={complianceFrequency}
          onChange={setComplianceFrequency}
          disabled={!complianceDigestEnabled}
        />

        <Text size="xs" variant="muted">
          {isAdminOrOwner
            ? 'You can also manage these preferences by clicking the unsubscribe link in any email notification.'
            : 'Contact your admin to change locked notification settings.'}
        </Text>
      </Stack>
    </Section>
  );
}
