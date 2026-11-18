import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleSessionTimeout, msUntilIdle } from './IdleSessionTimeout';

const { push, signOut, policy, warning } = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
  policy: { idleTimeoutMinutes: 15 as number | null },
  warning: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/utils/auth-client', () => ({ authClient: { signOut } }));
vi.mock('@/hooks/use-security-settings', () => ({ useSessionPolicy: () => policy }));
vi.mock('sonner', () => ({ toast: { warning } }));

describe('IdleSessionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    signOut.mockResolvedValue(undefined);
    localStorage.clear();
    policy.idleTimeoutMinutes = 15;
  });
  afterEach(() => vi.useRealTimers());

  it('computes the time left', () => {
    expect(msUntilIdle({ lastActivity: 0, timeoutMinutes: 15, now: 60_000 })).toBe(14 * 60_000);
  });

  it('warns a minute before and signs out after the timeout without input', async () => {
    render(<IdleSessionTimeout />);
    await act(async () => {
      vi.advanceTimersByTime(14 * 60_000 + 15_000);
    });
    expect(warning).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/auth?reason=idle');
  });

  it('keeps the session while the user is active', async () => {
    render(<IdleSessionTimeout />);
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        vi.advanceTimersByTime(10 * 60_000);
        window.dispatchEvent(new KeyboardEvent('keydown'));
      });
    }
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does nothing when the org has no idle timeout', async () => {
    policy.idleTimeoutMinutes = null;
    render(<IdleSessionTimeout />);
    await act(async () => {
      vi.advanceTimersByTime(24 * 60 * 60_000);
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});
