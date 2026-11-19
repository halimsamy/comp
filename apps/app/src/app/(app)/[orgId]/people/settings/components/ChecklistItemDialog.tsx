'use client';

import { api } from '@/lib/api-client';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
} from '@trycompai/design-system';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CHECKLIST_DEPARTMENTS, CHECKLIST_ROLES, type ChecklistKind, TEMPLATE_ENDPOINT, type TemplateItem } from './checklist-template';

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200),
  description: z.string().max(2000),
  dueDays: z.union([z.literal(''), z.coerce.number().int().min(0).max(365)]),
  evidenceRequired: z.boolean(),
  appliesToRoles: z.array(z.string()),
  appliesToDepartments: z.array(z.string()),
});
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

const toValues = (item: TemplateItem | null): FormInput => ({
  title: item?.title ?? '',
  description: item?.description ?? '',
  dueDays: item?.dueDays === null || item?.dueDays === undefined ? '' : String(item.dueDays),
  evidenceRequired: item?.evidenceRequired ?? false,
  appliesToRoles: item?.appliesToRoles ?? [],
  appliesToDepartments: item?.appliesToDepartments ?? [],
});

function CheckboxGroup({ label, options, value, onChange, format = (o) => o }: {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  format?: (option: string) => string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.includes(option)}
              onCheckedChange={(checked) => onChange(checked === true ? [...value, option] : value.filter((v) => v !== option))}
            />
            {format(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Create or edit a checklist item, including who it applies to (#91). `item` null with open = create. */
export function ChecklistItemDialog({ open, item, kind, onOpenChange, onSaved }: {
  open: boolean;
  item: TemplateItem | null;
  kind: ChecklistKind;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(item),
  });
  useEffect(() => {
    if (open) reset(toValues(item));
  }, [open, item, reset]);

  const handleSave = handleSubmit(async (values) => {
    const body = {
      title: values.title,
      description: values.description.trim() || (item ? null : undefined),
      evidenceRequired: values.evidenceRequired,
      appliesToRoles: values.appliesToRoles,
      appliesToDepartments: values.appliesToDepartments,
      ...(values.dueDays === '' ? (item ? { dueDays: null } : {}) : { dueDays: values.dueDays }),
    };
    const res = item ? await api.patch(`${TEMPLATE_ENDPOINT}/${item.id}`, body) : await api.post(TEMPLATE_ENDPOINT, { ...body, kind });
    if (res.error) {
      toast.error(item ? 'Failed to update checklist item' : 'Failed to create checklist item');
      return;
    }
    toast.success(item ? 'Checklist item updated' : 'Checklist item created');
    onSaved();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit checklist item' : 'Add checklist item'}</DialogTitle>
        </DialogHeader>
        <form id="checklist-item-form" onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="checklist-title">Title</Label>
            <Controller control={control} name="title" render={({ field: { ref: _ref, ...field } }) => (
              <Input {...field} id="checklist-title" placeholder="e.g., Return company laptop" />
            )} />
            {errors.title && <span role="alert" className="text-xs text-destructive">{errors.title.message}</span>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="checklist-description">Description</Label>
            <Controller control={control} name="description" render={({ field: { ref: _ref, ...field } }) => (
              <Textarea {...field} id="checklist-description" rows={3} placeholder="Optional details about this checklist item" />
            )} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="checklist-due-days">Due within (days)</Label>
            <Controller control={control} name="dueDays" render={({ field: { ref: _ref, value, ...field } }) => (
              <Input {...field} value={String(value ?? '')} id="checklist-due-days" type="number" min={0} max={365} placeholder="Optional, e.g. 30" />
            )} />
            {errors.dueDays && <span role="alert" className="text-xs text-destructive">Enter 0 to 365 days</span>}
          </div>
          <div className="flex items-center gap-2">
            <Controller control={control} name="evidenceRequired" render={({ field }) => (
              <Switch id="checklist-evidence" checked={field.value} onCheckedChange={(next) => field.onChange(Boolean(next))} />
            )} />
            <Label htmlFor="checklist-evidence">Evidence required</Label>
          </div>
          <Controller control={control} name="appliesToRoles" render={({ field }) => (
            <CheckboxGroup label="Applies to roles (none = everyone)" options={CHECKLIST_ROLES} value={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="appliesToDepartments" render={({ field }) => (
            <CheckboxGroup
              label="Applies to departments (none = every department)"
              options={CHECKLIST_DEPARTMENTS}
              value={field.value}
              onChange={field.onChange}
              format={(d) => d.toUpperCase()}
            />
          )} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="checklist-item-form" loading={isSubmitting}>
            {item ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
