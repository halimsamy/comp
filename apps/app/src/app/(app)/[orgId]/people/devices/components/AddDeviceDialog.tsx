'use client';

import { useOrganizationMembers } from '@/hooks/use-organization-members';
import { api } from '@/lib/api-client';
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
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CHECK_FIELDS, PLATFORM_LABELS } from '../lib/device-source';
import type { DeviceWithChecks } from '../types';

const deviceSchema = z.object({
  memberId: z.string().min(1, 'Choose who uses the device'),
  name: z.string().trim().min(1, 'Name the device').max(200),
  platform: z.enum(['macos', 'windows', 'linux']),
  osVersion: z.string().trim().min(1, 'Enter the OS version').max(100),
  serialNumber: z.string().trim().max(100),
  diskEncryptionEnabled: z.boolean(),
  antivirusEnabled: z.boolean(),
  passwordPolicySet: z.boolean(),
  screenLockEnabled: z.boolean(),
});
type DeviceValues = z.infer<typeof deviceSchema>;

const EMPTY: DeviceValues = {
  memberId: '',
  name: '',
  platform: 'macos',
  osVersion: '',
  serialNumber: '',
  diskEncryptionEnabled: false,
  antivirusEnabled: false,
  passwordPolicySet: false,
  screenLockEnabled: false,
};

const valuesOf = (device: DeviceWithChecks): DeviceValues => ({
  memberId: device.memberId ?? '',
  name: device.name,
  platform: device.platform,
  osVersion: device.osVersion,
  serialNumber: device.serialNumber ?? '',
  diskEncryptionEnabled: device.diskEncryptionEnabled,
  antivirusEnabled: device.antivirusEnabled,
  passwordPolicySet: device.passwordPolicySet,
  screenLockEnabled: device.screenLockEnabled,
});

const FieldError = ({ message }: { message?: string }) =>
  message ? (
    <span role="alert" className="text-xs text-destructive">
      {message}
    </span>
  ) : null;

/**
 * Records a device without the agent or device sync; its checks are attested.
 * With `device`, edits that manual device instead.
 */
export function AddDeviceDialog({
  open,
  onOpenChange,
  onAdded,
  device,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => Promise<unknown>;
  device?: DeviceWithChecks | null;
}) {
  const { members } = useOrganizationMembers();
  const active = useMemo(() => (Array.isArray(members) ? members : []).filter((m) => !m.deactivated), [members]);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeviceValues>({ resolver: zodResolver(deviceSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) reset(device ? valuesOf(device) : EMPTY);
  }, [open, device, reset]);

  const handleSave = handleSubmit(async ({ serialNumber, ...values }) => {
    const body = { ...values, ...(serialNumber ? { serialNumber } : {}) };
    const response = device ? await api.put(`/v1/devices/${device.id}`, body) : await api.post('/v1/devices', body);
    if (response.error) {
      toast.error(response.error);
      return;
    }
    await onAdded();
    toast.success(device ? 'Device updated' : 'Device added');
    reset(EMPTY);
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{device ? `Edit ${device.name}` : 'Add a device'}</DialogTitle>
          <DialogDescription>
            For devices without the Comp AI agent or device sync. Confirm each security check yourself; the
            device counts as compliant only when all four are on.
          </DialogDescription>
        </DialogHeader>
        <form id="add-device-form" onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="device-member">Used by</Label>
            <Controller
              control={control}
              name="memberId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(value) => field.onChange(value ?? '')}>
                  <SelectTrigger id="device-member" aria-label="Used by">
                    <SelectValue placeholder="Select a person">
                      {(value: string) => {
                        const member = active.find((m) => m.id === value);
                        return member ? member.user.name || member.user.email : 'Select a person';
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {active.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.user.name || m.user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.memberId?.message} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="device-name">Device name</Label>
              <Controller
                control={control}
                name="name"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Input {...field} id="device-name" placeholder="Jane's MacBook Pro" />
                )}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="device-platform">Platform</Label>
              <Controller
                control={control}
                name="platform"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                    <SelectTrigger id="device-platform" aria-label="Platform">
                      <SelectValue>{(value: string) => PLATFORM_LABELS[value] ?? value}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
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
              <Label htmlFor="device-os">OS version</Label>
              <Controller
                control={control}
                name="osVersion"
                render={({ field: { ref: _ref, ...field } }) => <Input {...field} id="device-os" placeholder="15.1" />}
              />
              <FieldError message={errors.osVersion?.message} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="device-serial">Serial number (optional)</Label>
              <Controller
                control={control}
                name="serialNumber"
                render={({ field: { ref: _ref, ...field } }) => <Input {...field} id="device-serial" />}
              />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Security checks confirmed</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CHECK_FIELDS.map((check) => (
                <label key={check.key} className="flex items-center gap-2 text-sm">
                  <Controller
                    control={control}
                    name={check.key}
                    render={({ field }) => (
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                    )}
                  />
                  {check.label}
                </label>
              ))}
            </div>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-device-form" loading={isSubmitting}>
            {device ? 'Save changes' : 'Add device'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
