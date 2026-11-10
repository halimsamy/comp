import { describe, expect, it } from 'bun:test';
import {
  attemptTimeoutSeconds,
  extractOrganizationId,
  isTerminalStatus,
  parseDurationSeconds,
  statusFlags,
  toQueueSettings,
  toSendSettings,
} from '../options';

describe('option mapping', () => {
  it('maps trigger.config defaults (3 attempts, 1s..10s backoff, 300s) to pg-boss queue settings', () => {
    expect(toQueueSettings({})).toEqual({
      retryLimit: 2,
      retryDelay: 1,
      retryBackoff: true,
      retryDelayMax: 10,
      expireInSeconds: 420,
      deleteAfterSeconds: 86400,
    });
  });

  it('maps retry and maxDuration from a task definition', () => {
    const settings = toQueueSettings({
      retry: { maxAttempts: 1, minTimeoutInMs: 5000, maxTimeoutInMs: 30000 },
      maxDuration: 60 * 30,
    });
    expect(settings.retryLimit).toBe(0);
    expect(settings.retryDelay).toBe(5);
    expect(settings.retryDelayMax).toBe(30);
    expect(settings.expireInSeconds).toBe(1800 + 120);
  });

  it('clamps maxDuration written in milliseconds below the pg-boss 24h ceiling', () => {
    expect(toQueueSettings({ maxDuration: 1000 * 60 * 30 }).expireInSeconds).toBe(86400);
  });

  it('maps per-call trigger options to send options', () => {
    const before = Date.now();
    const settings = toSendSettings({ delay: '10m', maxAttempts: 5, maxDuration: 60, concurrencyKey: 'x' });
    expect(settings.singletonKey).toBe('x');
    expect(settings.retryLimit).toBe(4);
    expect(settings.expireInSeconds).toBe(180);
    expect(settings.startAfter!.getTime()).toBeGreaterThanOrEqual(before + 600_000);
    expect(toSendSettings(undefined)).toEqual({});
    const at = new Date('2030-01-01T00:00:00Z');
    expect(toSendSettings({ delay: at }).startAfter).toBe(at);
  });

  it('times an attempt out before the expiry stored on its job row, even if maxDuration grew since', () => {
    // Queued with maxDuration 1h (expire 3720s), task now says 6h: stop at 3600s, not 21600s.
    expect(attemptTimeoutSeconds({ maxDuration: 6 * 3600, expireInSeconds: 3720 })).toBe(3600);
    expect(attemptTimeoutSeconds({ maxDuration: 60, expireInSeconds: 3720 })).toBe(60);
    expect(attemptTimeoutSeconds({ maxDuration: 60, expireInSeconds: 10 })).toBe(1);
  });

  it('parses trigger.dev duration strings', () => {
    expect(parseDurationSeconds('5m')).toBe(300);
    expect(parseDurationSeconds('7d')).toBe(604800);
    expect(parseDurationSeconds('30s')).toBe(30);
    expect(parseDurationSeconds(12)).toBe(12);
    expect(() => parseDurationSeconds('soon')).toThrow();
  });
});

describe('status mapping', () => {
  it('flags statuses like trigger.dev runs.retrieve', () => {
    expect(statusFlags('COMPLETED')).toEqual({
      isQueued: false, isExecuting: false, isCompleted: true, isSuccess: true, isFailed: false, isCancelled: false,
    });
    expect(statusFlags('TIMED_OUT')).toMatchObject({ isCompleted: true, isSuccess: false, isFailed: true });
    expect(statusFlags('CANCELED')).toMatchObject({ isCompleted: true, isFailed: false, isCancelled: true });
    expect(statusFlags('DELAYED')).toMatchObject({ isQueued: true, isCompleted: false });
    expect(statusFlags('EXECUTING')).toMatchObject({ isExecuting: true, isCompleted: false });
  });

  it('knows terminal statuses', () => {
    for (const s of ['COMPLETED', 'FAILED', 'CANCELED', 'TIMED_OUT', 'EXPIRED', 'CRASHED'] as const) {
      expect(isTerminalStatus(s)).toBe(true);
    }
    for (const s of ['QUEUED', 'DELAYED', 'EXECUTING'] as const) expect(isTerminalStatus(s)).toBe(false);
  });

  it('takes organizationId (or orgId) from the payload', () => {
    expect(extractOrganizationId({ organizationId: 'org_1' })).toBe('org_1');
    expect(extractOrganizationId({ orgId: 'org_2' })).toBe('org_2');
    expect(extractOrganizationId({ organizationId: 5 })).toBeNull();
    expect(extractOrganizationId('x')).toBeNull();
  });
});
