'use client';

import { useApi } from '@/hooks/use-api';
import { useApiSWR } from '@/hooks/use-api-swr';
import { usePermissions } from '@/hooks/use-permissions';
import { Badge, Button, Dialog, DialogTrigger, Section, Stack, Switch, Text } from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { TrainingModuleDialog } from './TrainingModuleDialog';

export interface TrainingModuleRow {
  id: string;
  title: string;
  description: string | null;
  frameworkReference: string | null;
  targetRoles: string[];
  targetDepartments: string[];
  recurrenceMonths: number;
  isEnabled: boolean;
}

const MODULES_ENDPOINT = '/v1/training/modules';

function audience(module: TrainingModuleRow): string {
  const roles = module.targetRoles.length > 0 ? module.targetRoles.join(', ') : 'all roles';
  const departments =
    module.targetDepartments.length > 0
      ? module.targetDepartments.map((d) => d.toUpperCase()).join(', ')
      : 'all departments';
  return `${roles} · ${departments} · renews every ${module.recurrenceMonths} months`;
}

/** Custom, role-targeted training (e.g. PCI DSS 6.2.2 secure coding, 12.6.3 role training). */
export function TrainingModulesSettings() {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('training', 'update');
  const { patch } = useApi();
  const { data, mutate } = useApiSWR<TrainingModuleRow[]>(MODULES_ENDPOINT);
  const modules = Array.isArray(data?.data) ? data.data : [];
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleToggle = async ({ module, next }: { module: TrainingModuleRow; next: boolean }) => {
    mutate(
      (current) =>
        current && Array.isArray(current.data)
          ? { ...current, data: current.data.map((m) => (m.id === module.id ? { ...m, isEnabled: next } : m)) }
          : current,
      { revalidate: false },
    );
    const res = await patch(`${MODULES_ENDPOINT}/${module.id}`, { isEnabled: next });
    if (res.error) {
      mutate();
      toast.error('Failed to update training module');
      return;
    }
    toast.success(next ? 'Training assigned' : 'Training no longer assigned');
  };

  return (
    <Section title="Role-based training">
      <Stack gap="md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Text size="sm" variant="muted">
            Extra training assigned by role or department, such as secure coding for developers. Members see it in the
            employee portal and must retake it when it expires.
          </Text>
          {canUpdate && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" />}>
                <Add size={16} />
                Add training
              </DialogTrigger>
              <TrainingModuleDialog
                onCreated={() => {
                  setDialogOpen(false);
                  mutate();
                }}
              />
            </Dialog>
          )}
        </div>
        {modules.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Text size="sm" variant="muted">
              No role-based training yet. PCI DSS asks for secure coding training for developers (6.2.2) and training
              for staff with security roles (12.6.3).
            </Text>
          </div>
        ) : (
          <Stack gap="sm">
            {modules.map((module) => (
              <div key={module.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text weight="medium">{module.title}</Text>
                    {module.frameworkReference && <Badge variant="outline">{module.frameworkReference}</Badge>}
                  </div>
                  <Text size="xs" variant="muted">
                    {audience(module)}
                  </Text>
                </div>
                <Switch
                  checked={module.isEnabled}
                  disabled={!canUpdate}
                  onCheckedChange={(next) => handleToggle({ module, next: Boolean(next) })}
                  aria-label={`Assign ${module.title}`}
                />
              </div>
            ))}
          </Stack>
        )}
      </Stack>
    </Section>
  );
}
