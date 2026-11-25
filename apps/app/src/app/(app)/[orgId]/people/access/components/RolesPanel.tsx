'use client';

import { useAccessSystems } from '@/hooks/use-access-reviews';
import { useAccessRoleMutations, useAccessRoles } from '@/hooks/use-access-roles';
import { usePermissions } from '@/hooks/use-permissions';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { Add, TrashCan } from '@trycompai/design-system/icons';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatDay } from '../lib/access-labels';
import { AllowedTypesCard } from './AllowedTypesCard';

const roleSchema = z.object({
  name: z.string().trim().min(1, 'Name the role').max(200),
  permissionsScope: z.string().max(1000),
  isPrivileged: z.boolean(),
});
type RoleValues = z.infer<typeof roleSchema>;
const EMPTY: RoleValues = { name: '', permissionsScope: '', isPrivileged: false };

/**
 * #159 / #172 / #177: approved roles per system (the RBAC matrix, structured)
 * and allowed account types. Review items holding other roles are flagged.
 */
export function RolesPanel() {
  const { systems, mutate: refreshSystems } = useAccessSystems();
  const { roles, mutate } = useAccessRoles();
  const mutations = useAccessRoleMutations();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('member', 'update');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const systemKey = selectedKey ?? systems[0]?.key ?? null;
  const system = systems.find((s) => s.key === systemKey) ?? null;
  const systemRoles = useMemo(() => roles.filter((r) => r.systemKey === systemKey), [roles, systemKey]);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: EMPTY });

  const handleAdd = handleSubmit(async (values) => {
    if (!system) return;
    try {
      await mutations.createRole({
        systemKey: system.key,
        systemName: system.name,
        name: values.name,
        permissionsScope: values.permissionsScope.trim() || undefined,
        isPrivileged: values.isPrivileged,
      });
      reset(EMPTY);
      await mutate();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to add the role');
    }
  });

  const handleDelete = async (id: string) => {
    try {
      await mutations.deleteRole(id);
      await mutate();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to delete the role');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-[260px]">
          <Select value={systemKey ?? ''} onValueChange={(value) => setSelectedKey(value || null)}>
            <SelectTrigger aria-label="System">
              <SelectValue placeholder="Select a system">
                {(value: string) => systems.find((s) => s.key === value)?.name ?? 'Select a system'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {systems.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.name} · {roles.filter((r) => r.systemKey === s.key).length} roles
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Text size="sm" variant="muted">
        Approved roles of the system. When a system has approved roles, accounts holding any other role, and admins
        without a privileged role, are flagged in access reviews (PCI DSS 7.2.1, 7.2.2).
      </Text>

      {systemRoles.length === 0 ? (
        <Text size="sm" variant="muted">
          No approved roles yet. Nothing is flagged for roles until you add them.
        </Text>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Approved by</TableHead>
              <TableHead>Last reviewed</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {systemRoles.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{role.name}</span>
                    {role.isPrivileged && <Badge variant="outline">Privileged</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-[200px] max-w-[420px] whitespace-normal break-words">
                    <Text size="sm">{role.permissionsScope ?? '—'}</Text>
                  </div>
                </TableCell>
                <TableCell>{role.approvedByName ?? '—'}</TableCell>
                <TableCell>{formatDay(role.lastReviewedAt)}</TableCell>
                {canEdit && (
                  <TableCell>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${role.name}`}
                      onClick={() => void handleDelete(role.id)}
                    >
                      <TrashCan size={14} />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canEdit && system && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-md border border-border p-3 lg:flex-row lg:items-start">
          <div className="flex w-full flex-col gap-1 lg:w-[220px]">
            <Controller
              control={control}
              name="name"
              render={({ field: { ref: _ref, ...field } }) => <Input {...field} placeholder="Role name" aria-label="Role name" />}
            />
            {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
          </div>
          <div className="w-full lg:flex-1">
            <Controller
              control={control}
              name="permissionsScope"
              render={({ field: { ref: _ref, ...field } }) => (
                <Input {...field} placeholder="What it can do (optional)" aria-label="Permission scope" />
              )}
            />
          </div>
          <label className="flex items-center gap-2 py-1 text-sm">
            <Controller
              control={control}
              name="isPrivileged"
              render={({ field }) => (
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              )}
            />
            Privileged
          </label>
          <Button type="submit" iconLeft={<Add size={16} />} loading={isSubmitting}>
            Add role
          </Button>
        </form>
      )}

      {system?.kind === 'manual' && (
        <AllowedTypesCard system={system} canEdit={canEdit} onSaved={refreshSystems} />
      )}

    </div>
  );
}
