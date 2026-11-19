'use client';

import type { AccessSystem } from '@/hooks/use-access-reviews';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
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
  Text,
} from '@trycompai/design-system';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { nextReviewName } from '../lib/access-labels';
import type { OwnerOption } from './AccountOwnerDialog';

const reviewSchema = z.object({
  name: z.string().trim().min(1, 'Name the review').max(200),
  dueDate: z.string().min(1, 'Pick an end date'),
  systems: z
    .array(
      z.object({
        systemKey: z.string(),
        selected: z.boolean(),
        reviewerMemberId: z.string(),
      }),
    )
    .refine((systems) => systems.some((s) => s.selected), 'Pick at least one system'),
});
export type ReviewValues = z.infer<typeof reviewSchema>;

function defaults({
  systems,
  existingNames,
  now = new Date(),
}: {
  systems: AccessSystem[];
  existingNames: string[];
  now?: Date;
}): ReviewValues {
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  return {
    name: nextReviewName({ existing: existingNames, now }),
    dueDate: due.toISOString().slice(0, 10),
    systems: systems.map((s) => ({ systemKey: s.key, selected: s.accountCount > 0, reviewerMemberId: '' })),
  };
}

/** Start a review: name, due date, systems in scope and a reviewer per system. */
export function StartReviewSheet({
  open,
  systems,
  members,
  existingNames = [],
  onOpenChange,
  onStart,
}: {
  open: boolean;
  systems: AccessSystem[];
  members: OwnerOption[];
  /** Names already used, so the suggested half-year name is unique. */
  existingNames?: string[];
  onOpenChange: (open: boolean) => void;
  onStart: (values: ReviewValues) => Promise<void>;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReviewValues>({ resolver: zodResolver(reviewSchema), values: defaults({ systems, existingNames }) });

  const handleStart = handleSubmit(async (values) => {
    await onStart(values);
    onOpenChange(false);
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Start an access review</SheetTitle>
          <SheetDescription>
            The accounts of each system are snapshotted now. Reviewers keep, revoke or modify each
            one, then another manager signs off. Reviewers are emailed now and three days before the
            end date. Only people who can manage members can review. PCI DSS 7.2.4 requires this at
            least every six months.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form id="start-review-form" onSubmit={handleStart} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="review-name">Name</Label>
              <Controller
                control={control}
                name="name"
                render={({ field: { ref: _ref, ...field } }) => <Input {...field} id="review-name" />}
              />
              {errors.name && (
                <span role="alert" className="text-xs text-destructive">
                  {errors.name.message}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="review-start">Start date</Label>
                <Input id="review-start" type="date" value={new Date().toISOString().slice(0, 10)} disabled readOnly />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="review-due">End date</Label>
                <Controller
                  control={control}
                  name="dueDate"
                  render={({ field: { ref: _ref, ...field } }) => <Input {...field} id="review-due" type="date" />}
                />
                {errors.dueDate && (
                  <span role="alert" className="text-xs text-destructive">
                    {errors.dueDate.message}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Label>Systems and reviewers</Label>
              {systems.map((system, index) => (
                <div key={system.key} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Controller
                      control={control}
                      name={`systems.${index}.selected`}
                      render={({ field }) => (
                        <Checkbox
                          id={`review-system-${index}`}
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          disabled={system.accountCount === 0}
                        />
                      )}
                    />
                    <label htmlFor={`review-system-${index}`} className="flex-1 text-sm font-medium">
                      {system.name}
                    </label>
                    <Text size="xs" variant="muted">
                      {system.accountCount} accounts
                    </Text>
                  </div>
                  <Controller
                    control={control}
                    name={`systems.${index}.reviewerMemberId`}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(value) => field.onChange(value ?? '')}>
                        <SelectTrigger aria-label={`Reviewer for ${system.name}`}>
                          <SelectValue placeholder="Reviewer (optional)">
                            {(value: string) => members.find((m) => m.id === value)?.label ?? 'Reviewer (optional)'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              ))}
              {errors.systems && (
                <span role="alert" className="text-xs text-destructive">
                  {errors.systems.message ?? errors.systems.root?.message}
                </span>
              )}
            </div>
          </form>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="start-review-form" loading={isSubmitting}>
            Start review
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
