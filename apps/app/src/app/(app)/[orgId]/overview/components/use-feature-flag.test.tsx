import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The live posthog-js value is controlled per-test. `undefined` simulates a
// client whose /ingest/flags request is blocked (ad blocker, privacy browser,
// corporate proxy) — flags never load, so the hook never resolves.
const { useFeatureFlagEnabledMock } = vi.hoisted(() => ({
  useFeatureFlagEnabledMock: vi.fn<(flag: string) => boolean | undefined>(),
}));

vi.mock('posthog-js/react', () => ({
  useFeatureFlagEnabled: (flag: string) => useFeatureFlagEnabledMock(flag),
  usePostHog: () => null,
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ServerFeatureFlagsProvider, useFeatureFlag } from '@trycompai/analytics';

describe('useFeatureFlag server fallback', () => {
  it('returns false when flags never load and no server flags are provided', () => {
    useFeatureFlagEnabledMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useFeatureFlag('is-timeline-enabled'));

    expect(result.current).toBe(false);
  });

  it('falls back to the server-evaluated value when flags never load', () => {
    useFeatureFlagEnabledMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useFeatureFlag('is-timeline-enabled'), {
      wrapper: ({ children }) => (
        <ServerFeatureFlagsProvider flags={{ 'is-timeline-enabled': true }}>
          {children}
        </ServerFeatureFlagsProvider>
      ),
    });

    expect(result.current).toBe(true);
  });

  it('treats multivariate (string) server values as enabled', () => {
    useFeatureFlagEnabledMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useFeatureFlag('is-timeline-enabled'), {
      wrapper: ({ children }) => (
        <ServerFeatureFlagsProvider flags={{ 'is-timeline-enabled': 'variant-a' }}>
          {children}
        </ServerFeatureFlagsProvider>
      ),
    });

    expect(result.current).toBe(true);
  });

  it('stays false when both live and server values are disabled', () => {
    useFeatureFlagEnabledMock.mockReturnValue(false);

    const { result } = renderHook(() => useFeatureFlag('is-timeline-enabled'), {
      wrapper: ({ children }) => (
        <ServerFeatureFlagsProvider flags={{ 'is-timeline-enabled': false }}>
          {children}
        </ServerFeatureFlagsProvider>
      ),
    });

    expect(result.current).toBe(false);
  });

  it('prefers an enabled server value over a stale persisted live=false', () => {
    // posthog-js serves flags persisted from an older session even when the
    // network is blocked — those can predate the admin toggle. The fresher
    // server-side evaluation must win for enable rollouts.
    useFeatureFlagEnabledMock.mockReturnValue(false);

    const { result } = renderHook(() => useFeatureFlag('is-timeline-enabled'), {
      wrapper: ({ children }) => (
        <ServerFeatureFlagsProvider flags={{ 'is-timeline-enabled': true }}>
          {children}
        </ServerFeatureFlagsProvider>
      ),
    });

    expect(result.current).toBe(true);
  });

  it('returns true from the live value alone, without a provider', () => {
    useFeatureFlagEnabledMock.mockReturnValue(true);

    const { result } = renderHook(() => useFeatureFlag('is-timeline-enabled'));

    expect(result.current).toBe(true);
  });
});
