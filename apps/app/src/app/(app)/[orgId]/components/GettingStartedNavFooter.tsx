'use client';

import { useOnboardingChecklist } from '@/hooks/use-onboarding-checklist';
import { AppShellNavFooter, Progress, Text } from '@trycompai/design-system';
import { Close, Rocket } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const dismissKey = (organizationId: string) => `getting-started-dismissed:${organizationId}`;

function readDismissed(organizationId: string): boolean {
  try {
    return window.localStorage.getItem(dismissKey(organizationId)) === 'true';
  } catch {
    return false;
  }
}

/** "Finish setup" progress pinned to the bottom of the compliance sidebar, for members who run setup. */
export function GettingStartedNavFooter({
  organizationId,
  canManage,
  isActive,
}: {
  organizationId: string;
  canManage: boolean;
  isActive: boolean;
}) {
  const { checklist } = useOnboardingChecklist({ enabled: canManage });
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readDismissed(organizationId));
  }, [organizationId]);

  if (!canManage || !checklist || checklist.isComplete || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(organizationId), 'true');
    } catch {
      // Per-viewer convenience only; the guide stays reachable from the search palette.
    }
  };

  return (
    <AppShellNavFooter>
      <div
        className={`relative flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
          isActive ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/40 hover:bg-muted'
        }`}
      >
        <Link href={`/${organizationId}/getting-started`} className="flex flex-col gap-2 pr-5">
          <span className="flex items-center gap-2">
            <Rocket size={16} className="text-primary" aria-hidden />
            <Text as="span" size="sm" weight="medium">
              Finish setup
            </Text>
          </span>
          <Progress value={checklist.percent} aria-label="Setup progress" />
          <Text as="span" size="xs" variant="muted">
            {checklist.completed}/{checklist.total} steps completed
          </Text>
        </Link>
        <button
          type="button"
          aria-label="Hide setup progress"
          onClick={handleDismiss}
          className="absolute right-2 top-2 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Close size={14} />
        </button>
      </div>
    </AppShellNavFooter>
  );
}
