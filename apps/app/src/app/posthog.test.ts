import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFeatureFlags } from './posthog';

describe('getFeatureFlags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns no flags without PostHog or forced flags', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('FORCE_ENABLED_FEATURE_FLAGS', '');
    await expect(getFeatureFlags('usr_1')).resolves.toEqual({});
  });

  it('turns on every flag listed in FORCE_ENABLED_FEATURE_FLAGS without PostHog', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    vi.stubEnv('FORCE_ENABLED_FEATURE_FLAGS', ' is-isms-enabled, ai-vendor-questionnaire ,,');
    await expect(getFeatureFlags('usr_1')).resolves.toEqual({
      'is-isms-enabled': true,
      'ai-vendor-questionnaire': true,
    });
  });
});
