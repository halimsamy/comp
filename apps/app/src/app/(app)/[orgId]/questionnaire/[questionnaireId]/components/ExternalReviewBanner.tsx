'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { apiClient } from '@/lib/api-client';
import { Alert, AlertDescription, AlertTitle, Button } from '@trycompai/design-system';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

/** Review gate for questionnaires uploaded from the trust portal: approve to email the answers. */
export function ExternalReviewBanner({
  questionnaireId,
  reviewStatus,
  requesterEmail,
  reviewedAt,
}: {
  questionnaireId: string;
  reviewStatus: 'pending_review' | 'approved' | null | undefined;
  requesterEmail: string | null | undefined;
  reviewedAt: string | null | undefined;
}) {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [approving, setApproving] = useState(false);

  if (!reviewStatus || !requesterEmail) return null;

  if (reviewStatus === 'approved') {
    return (
      <div className="mb-4">
        <Alert variant="success">
          <AlertTitle>Answers sent</AlertTitle>
          <AlertDescription>
            Approved and emailed to {requesterEmail}
            {reviewedAt ? ` on ${new Date(reviewedAt).toLocaleDateString()}` : ''}.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await apiClient.post(`/v1/questionnaire/${questionnaireId}/approve-external`);
      if (res.error) throw new Error(res.error);
      toast.success(`Answers approved and emailed to ${requesterEmail}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve the answers');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="mb-4">
      <Alert variant="warning">
        <AlertTitle>Waiting for your review</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {requesterEmail} uploaded this questionnaire on your trust portal. AI drafted the
              answers. Check and edit them below, then approve to email them to the requester.
            </span>
            {hasPermission('questionnaire', 'update') && (
              <Button loading={approving} onClick={handleApprove}>
                Approve and send
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
