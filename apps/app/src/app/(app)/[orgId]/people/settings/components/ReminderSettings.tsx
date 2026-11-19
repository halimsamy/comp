'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import { Section, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@trycompai/design-system';
import { toast } from 'sonner';

const FREQUENCIES = [
  { value: 'off', label: 'Off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
] as const;

/** #162: how often people with open security tasks get the "Your security tasks" email. */
export function ReminderSettings() {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('member', 'update');
  const { data, mutate } = useApiSWR<{ frequency: string }>('/v1/people-lifecycle/reminder-settings');
  const frequency = data?.data?.frequency ?? 'weekly';

  const handleChange = async (value: string | null) => {
    if (!value || value === frequency) return;
    const response = await api.put('/v1/people-lifecycle/reminder-settings', { frequency: value });
    if (response.error) {
      toast.error(response.error);
      return;
    }
    await mutate();
    toast.success('Reminder frequency saved');
  };

  return (
    <Section title="Security task reminders">
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <Text weight="medium">Email people with open security tasks</Text>
          <Text size="sm" variant="muted">
            Policies to accept, training to finish, the device agent and onboarding items. You can also send a
            reminder from the People table.
          </Text>
        </div>
        <div className="w-full sm:w-[160px]">
          <Select value={frequency} onValueChange={(value) => void handleChange(value)} disabled={!canUpdate}>
            <SelectTrigger aria-label="Reminder frequency">
              <SelectValue>{(value: string) => FREQUENCIES.find((f) => f.value === value)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Section>
  );
}
