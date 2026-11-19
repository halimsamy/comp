'use client';

import {
  Alert,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Stack,
  Text,
} from '@trycompai/design-system';
import { Add, Events, WarningAlt } from '@trycompai/design-system/icons';
import { useState } from 'react';
import type { IsmsManagementReview } from '../isms-types';
import type { ApproverOption } from './IsmsApprovalSection';
import { MEETING_TYPES, MEETING_TYPE_LABELS } from './management-review-constants';
import { ReviewCard, type ReviewHandlers } from './ReviewCard';
import { IsmsRegisterShell, SelectLabel } from './shared';

const ALL = 'all';

interface ReviewsListProps extends ReviewHandlers {
  reviews: IsmsManagementReview[];
  canEdit: boolean;
  memberOptions: ApproverOption[];
  chairOptions: string[];
  validationMessages: string[];
  onCreateReview: () => Promise<void>;
}

/**
 * The Reviews register (clause 9.3): a list of review instances, each
 * expanding to its meeting details, Inputs (9.3.2) table, outputs, actions,
 * and chair sign-off. "New review" creates an instance pre-filled with the
 * full template — reference, chair and attendees from Roles (5.3), output
 * text, and the ten default input rows.
 */
export function ReviewsList({
  reviews,
  canEdit,
  memberOptions,
  chairOptions,
  validationMessages,
  onCreateReview,
  ...handlers
}: ReviewsListProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [meetingType, setMeetingType] = useState<string>(ALL);
  const visible =
    meetingType === ALL ? reviews : reviews.filter((review) => review.meetingType === meetingType);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await onCreateReview();
    } catch {
      // Error already surfaced via toast by the caller.
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Stack gap="4">
      {validationMessages.length > 0 ? (
        <Alert variant="warning" icon={<WarningAlt />}>
          <Text size="sm">
            Before the Clause 9.3 document can be submitted:{' '}
            {validationMessages.join(' ')}
          </Text>
        </Alert>
      ) : null}

      <IsmsRegisterShell
        title="Reviews"
        count={reviews.length}
        emptyIcon={Events}
        emptyTitle="No reviews yet"
        emptyDescription="Create your first management review — it opens pre-filled with the full template, including the ten ISO-mandated inputs as the meeting agenda."
        footer={
          canEdit ? (
            <div className="flex">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCreate()}
                disabled={isCreating}
                loading={isCreating}
                iconLeft={<Add size={16} />}
              >
                New review
              </Button>
            </div>
          ) : undefined
        }
      >
        <Stack gap="3">
          {reviews.length > 1 ? (
            <div className="w-full sm:w-56">
              <Select value={meetingType} onValueChange={(next) => setMeetingType(next ?? ALL)}>
                <SelectTrigger aria-label="Filter by meeting">
                  <SelectLabel labels={{ [ALL]: 'All meetings', ...MEETING_TYPE_LABELS }} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All meetings</SelectItem>
                  {MEETING_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {MEETING_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {visible.length === 0 ? (
            <Text size="sm" variant="muted">
              No reviews of this type yet.
            </Text>
          ) : null}
          {visible.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              reviews={reviews}
              canEdit={canEdit}
              memberOptions={memberOptions}
              chairOptions={chairOptions}
              {...handlers}
            />
          ))}
        </Stack>
      </IsmsRegisterShell>
    </Stack>
  );
}
