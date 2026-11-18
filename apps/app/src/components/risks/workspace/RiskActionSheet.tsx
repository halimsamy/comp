'use client';

import type { RiskTreatmentAction } from '@/hooks/use-risk-workspace';
import { useRisks } from '@/hooks/use-risks';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@trycompai/design-system';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ACTION_STATUS_LABEL } from './risk-actions-csv';
import { memberLabel, type WorkspaceMember } from './workspace-types';

const STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'canceled'] as const;

const actionSchema = z.object({
  riskId: z.string().min(1, 'Pick the risk this action treats'),
  title: z.string().trim().min(1, 'Describe the action').max(300),
  description: z.string().max(5000),
  assigneeId: z.string(),
  dueDate: z.string(),
  status: z.enum(STATUSES),
});
export type RiskActionValues = z.infer<typeof actionSchema>;

function toDefaults(action: RiskTreatmentAction | null): RiskActionValues {
  return {
    riskId: action?.entityId ?? '',
    title: action?.title ?? '',
    description: action?.description ?? '',
    assigneeId: action?.assignee?.id ?? '',
    dueDate: action?.dueDate ? action.dueDate.slice(0, 10) : '',
    status: action?.status ?? 'todo',
  };
}

const ALL_RISKS = { perPage: 250 } as const;

/** Add or edit a risk treatment action: risk, owner, due date, status. */
export function RiskActionSheet({
  open,
  action,
  members,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  /** The action being edited; null adds a new one. */
  action: RiskTreatmentAction | null;
  members: WorkspaceMember[];
  onOpenChange: (open: boolean) => void;
  onSave: (values: RiskActionValues) => Promise<void>;
}) {
  const { data } = useRisks({ queryParams: ALL_RISKS });
  const risks = useMemo(() => {
    const list = data?.data?.data;
    return Array.isArray(list) ? list.filter((risk) => risk.status !== 'archived') : [];
  }, [data]);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<RiskActionValues>({
    resolver: zodResolver(actionSchema),
    values: toDefaults(action),
  });

  const handleSave = handleSubmit(async (values) => {
    await onSave(values);
    onOpenChange(false);
  });

  const riskTitle = (id: string) => risks.find((risk) => risk.id === id)?.title ?? 'Select a risk';
  const ownerTitle = (id: string) => {
    const member = members.find((candidate) => candidate.id === id);
    return member ? memberLabel(member) : 'Unassigned';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{action ? 'Edit treatment action' : 'Add treatment action'}</SheetTitle>
          <SheetDescription>
            A step that carries out a risk&apos;s treatment plan (ISO 27001 6.1.3, 8.3). Give it
            an owner and a due date so it shows up in the tracker.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="risk-action-form" onSubmit={handleSave} className="flex flex-col gap-5">
            {!action && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="risk-action-risk">Risk</Label>
                <Controller
                  control={control}
                  name="riskId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value) => field.onChange(value ?? '')}>
                      <SelectTrigger id="risk-action-risk" aria-label="Risk">
                        <SelectValue placeholder="Select a risk">
                          {(value: string) => (value ? riskTitle(value) : 'Select a risk')}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {risks.map((risk) => (
                          <SelectItem key={risk.id} value={risk.id}>
                            {risk.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.riskId && (
                  <span role="alert" className="text-xs text-destructive">
                    {errors.riskId.message}
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="risk-action-title">Action</Label>
              <Controller
                control={control}
                name="title"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Input {...field} id="risk-action-title" placeholder="Enable MFA on the payment admin console" />
                )}
              />
              {errors.title && (
                <span role="alert" className="text-xs text-destructive">
                  {errors.title.message}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="risk-action-description">Notes (optional)</Label>
              <Controller
                control={control}
                name="description"
                render={({ field: { ref: _ref, ...field } }) => (
                  <Textarea {...field} id="risk-action-description" rows={3} />
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="risk-action-owner">Owner</Label>
                <Controller
                  control={control}
                  name="assigneeId"
                  render={({ field }) => (
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(value) => field.onChange(!value || value === 'none' ? '' : value)}
                    >
                      <SelectTrigger id="risk-action-owner" aria-label="Owner">
                        <SelectValue>{(value: string) => ownerTitle(value)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {memberLabel(member)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="risk-action-due">Due date</Label>
                <Controller
                  control={control}
                  name="dueDate"
                  render={({ field: { ref: _ref, ...field } }) => (
                    <Input {...field} id="risk-action-due" type="date" />
                  )}
                />
              </div>
            </div>
            {action && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="risk-action-status">Status</Label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <SelectTrigger id="risk-action-status" aria-label="Status">
                        <SelectValue>
                          {(value: (typeof STATUSES)[number]) => ACTION_STATUS_LABEL[value]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {ACTION_STATUS_LABEL[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
          </form>
        </SheetBody>
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="risk-action-form" loading={isSubmitting} disabled={isSubmitting}>
            {action ? 'Save action' : 'Add action'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
