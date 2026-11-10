import type { Properties } from 'posthog-js';
import type { PostHog } from 'posthog-node';

let posthogInstance: PostHog | null = null;

async function getPostHogClient(): Promise<PostHog | null> {
  if (posthogInstance) {
    return posthogInstance;
  }

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (apiKey && apiHost) {
    const { PostHog } = await import('posthog-node');
    posthogInstance = new PostHog(apiKey, {
      flushAt: 1,
      flushInterval: 0,
    });
    return posthogInstance;
  }

  return null;
}

export { getPostHogClient };

export async function track(distinctId: string, eventName: string, properties?: Properties) {
  const client = await getPostHogClient();
  if (!client) return;

  client.capture({
    distinctId,
    event: eventName,
    properties,
  });
}

export async function identify(distinctId: string, properties?: Properties) {
  const client = await getPostHogClient();
  if (!client) return;

  client.identify({
    distinctId,
    properties,
  });
}

/** Flags turned on for everyone via FORCE_ENABLED_FEATURE_FLAGS (comma-separated), e.g. without PostHog. */
function forcedFeatureFlags(): Record<string, true> {
  const keys = (process.env.FORCE_ENABLED_FEATURE_FLAGS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  return Object.fromEntries(keys.map((key) => [key, true]));
}

export async function getFeatureFlags(
  distinctId: string,
  options?: { groups?: Record<string, string> },
) {
  const client = await getPostHogClient();
  const flags = client
    ? await client.getAllFlags(distinctId, { groups: options?.groups })
    : {};
  return { ...flags, ...forcedFeatureFlags() };
}
