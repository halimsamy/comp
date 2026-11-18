'use client';

import { useSessionPolicy } from '@/hooks/use-security-settings';
import { authClient } from '@/utils/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const ACTIVITY_KEY = 'comp:last-activity';
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;
const CHECK_INTERVAL_MS = 15_000;
const WARNING_MS = 60_000;

/** Milliseconds left before the idle timeout fires (negative once it has). */
export function msUntilIdle({
  lastActivity,
  timeoutMinutes,
  now,
}: {
  lastActivity: number;
  timeoutMinutes: number;
  now: number;
}): number {
  return lastActivity + timeoutMinutes * 60_000 - now;
}

function readSharedActivity(): number {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeSharedActivity(at: number) {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    // Storage blocked: this tab still tracks its own activity.
  }
}

/**
 * Signs the user out after the org's idle timeout (PCI DSS 8.2.8). Background
 * polling keeps the API session warm, so only real input counts as activity;
 * activity in any tab counts for all tabs. The API enforces the same timeout.
 */
export function IdleSessionTimeout() {
  const { idleTimeoutMinutes } = useSessionPolicy();
  const router = useRouter();
  const lastActivity = useRef(Date.now());
  const warned = useRef(false);

  useEffect(() => {
    if (!idleTimeoutMinutes) return;
    lastActivity.current = Date.now();
    writeSharedActivity(lastActivity.current);

    const handleActivity = () => {
      const now = Date.now();
      // Throttle: one write per 5 seconds is plenty for minute-level timeouts.
      if (now - lastActivity.current < 5_000) return;
      lastActivity.current = now;
      warned.current = false;
      writeSharedActivity(now);
    };

    const handleCheck = async () => {
      const last = Math.max(lastActivity.current, readSharedActivity());
      const remaining = msUntilIdle({
        lastActivity: last,
        timeoutMinutes: idleTimeoutMinutes,
        now: Date.now(),
      });
      if (remaining <= 0) {
        window.clearInterval(timer);
        await authClient.signOut().catch(() => undefined);
        router.push('/auth?reason=idle');
        return;
      }
      if (remaining <= WARNING_MS && !warned.current) {
        warned.current = true;
        toast.warning('You will be signed out in 1 minute because of inactivity.');
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }
    const timer = window.setInterval(handleCheck, CHECK_INTERVAL_MS);
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, handleActivity);
      window.clearInterval(timer);
    };
  }, [idleTimeoutMinutes, router]);

  return null;
}
