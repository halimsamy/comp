'use client';

import { useOnboardingChecklist } from '@/hooks/use-onboarding-checklist';
import type { NavFeatures } from '@/lib/nav';
import { canAccessRoute, hasPermission, type UserPermissions } from '@/lib/permissions';
import { useFeatureFlag } from '@trycompai/analytics';
import { useMemo } from 'react';
import { useIso27001FrameworkId } from '../documents/isms/hooks/useIso27001FrameworkId';

/** PostHog flag gating the ISMS area (same as DocumentsPageTabs and documents/isms/layout). */
const ISMS_FEATURE_FLAG = 'is-isms-enabled';

/** Runtime nav conditions shared by the sidebar and the palette. */
export function useNavFeatures({
  organizationId,
  permissions,
  isQuestionnaireEnabled,
  isTrustNdaEnabled,
  isSecurityEnabled,
}: {
  organizationId: string;
  permissions: UserPermissions;
  isQuestionnaireEnabled: boolean;
  isTrustNdaEnabled: boolean;
  isSecurityEnabled: boolean;
}): NavFeatures {
  const ismsFlag = useFeatureFlag(ISMS_FEATURE_FLAG);
  const isoFrameworkId = useIso27001FrameworkId(organizationId);
  const canManageSetup = hasPermission(permissions, 'organization', 'update');
  const { checklist } = useOnboardingChecklist({ enabled: canManageSetup });

  // ISMS and SoA only exist once ISO 27001 is active (the rule documents/isms/layout enforces).
  const isms =
    canAccessRoute(permissions, 'documents') &&
    (ismsFlag === true || process.env.NODE_ENV === 'development') &&
    !!isoFrameworkId;
  const setup = canManageSetup && !!checklist && !checklist.isComplete;

  return useMemo(
    () => ({
      questionnaire: isQuestionnaireEnabled,
      trust: isTrustNdaEnabled,
      security: isSecurityEnabled,
      isms,
      setup,
    }),
    [isQuestionnaireEnabled, isTrustNdaEnabled, isSecurityEnabled, isms, setup],
  );
}
