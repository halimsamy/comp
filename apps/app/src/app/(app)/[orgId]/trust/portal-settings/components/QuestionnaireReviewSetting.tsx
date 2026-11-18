'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import { useTrustPortalSettings } from '@/hooks/use-trust-portal-settings';
import { Switch, Text } from '@trycompai/design-system';
import { useState } from 'react';
import { toast } from 'sonner';

/** "Review AI answers before sending" for questionnaires uploaded from the public trust portal. */
export function QuestionnaireReviewSetting({ canUpdate }: { canUpdate: boolean }) {
  const { data, mutate } = useApiSWR<{ securityQuestionnaireRequiresReview?: boolean }>(
    '/v1/trust-portal/settings',
  );
  const { updateSecurityQuestionnaireRequiresReview } = useTrustPortalSettings();
  const [saving, setSaving] = useState(false);
  const requiresReview = data?.data?.securityQuestionnaireRequiresReview ?? true;

  const handleChange = async (checked: boolean) => {
    setSaving(true);
    try {
      await updateSecurityQuestionnaireRequiresReview(checked);
      await mutate();
      toast.success(
        checked
          ? 'Answers will be held for review before they are sent'
          : 'Answers will be sent to visitors right away',
      );
    } catch {
      toast.error('Failed to update the review setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Text weight="medium">Review AI answers before sending</Text>
        <Text size="sm" variant="muted">
          Visitors get a confirmation instead of instant answers. Owners and admins are emailed,
          review the answers under Questionnaires, then approve them to email the visitor.
          Recommended.
        </Text>
      </div>
      <Switch
        checked={requiresReview}
        onCheckedChange={handleChange}
        disabled={!canUpdate || saving}
        aria-label="Review AI answers before sending"
      />
    </div>
  );
}
