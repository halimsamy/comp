'use client';

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@trycompai/design-system';
import { Controller, type Control } from 'react-hook-form';
import type { ApproverOption } from './IsmsApprovalSection';
import type { RequirementFormValues } from './requirement-schema';
import { IsmsFieldLabel, SelectLabel, optionLabels } from './shared';

const NONE = 'none';

/** Owner and last-review date of an interested-party requirement (4.2b). */
export function RequirementOwnerFields({
  control,
  memberOptions,
}: {
  control: Control<RequirementFormValues>;
  memberOptions: ApproverOption[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <IsmsFieldLabel label="Owner">
        <Controller
          control={control}
          name="ownerMemberId"
          render={({ field }) => (
            <Select
              value={field.value || NONE}
              onValueChange={(next) => field.onChange(next === NONE ? '' : next)}
            >
              <SelectTrigger aria-label="Requirement owner">
                <SelectLabel labels={optionLabels(memberOptions)} placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {memberOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </IsmsFieldLabel>
      <IsmsFieldLabel label="Last reviewed">
        <Controller
          control={control}
          name="lastReviewedAt"
          render={({ field: { ref: _ref, ...field } }) => (
            <Input {...field} type="date" aria-label="Requirement last reviewed" />
          )}
        />
      </IsmsFieldLabel>
    </div>
  );
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** A requirement is due for review when it was never reviewed or not in the last 12 months. */
export function isReviewDue(lastReviewedAt: string | null, now = new Date()): boolean {
  return !lastReviewedAt || now.getTime() - new Date(lastReviewedAt).getTime() > YEAR_MS;
}
