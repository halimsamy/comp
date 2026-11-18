import { describe, expect, it } from 'bun:test';
import type { CheckContext } from '../../../../types';
import { issueCountThresholdCheck } from '../issue-count-threshold';
import { openSecurityIssuesCheck } from '../open-security-issues';

const makeCtx = (fetch: CheckContext['fetch']) => {
  const passes: string[] = [];
  const ctx = {
    accessToken: 'tok',
    credentials: {},
    variables: {},
    connectionId: 'conn_1',
    organizationId: 'org_1',
    metadata: {},
    log: () => {},
    warn: () => {},
    error: () => {},
    pass: (r: { title: string }) => passes.push(r.title),
    fail: () => {},
    fetch,
  } as unknown as CheckContext;
  return { ctx, passes };
};

const failingFetch = (async () => {
  throw new Error('503 Service Unavailable');
}) as CheckContext['fetch'];

describe('Aikido checks — API errors are inconclusive, never a pass', () => {
  it('open_security_issues throws instead of passing', async () => {
    const { ctx, passes } = makeCtx(failingFetch);
    await expect(openSecurityIssuesCheck.run(ctx)).rejects.toThrow('503');
    expect(passes).toHaveLength(0);
  });

  it('issue_count_threshold throws instead of passing', async () => {
    const { ctx, passes } = makeCtx(failingFetch);
    await expect(issueCountThresholdCheck.run(ctx)).rejects.toThrow('503');
    expect(passes).toHaveLength(0);
  });

  it('issue_count_threshold throws on an unparseable response', async () => {
    const { ctx, passes } = makeCtx((async <T,>() => ({}) as T) as CheckContext['fetch']);
    await expect(issueCountThresholdCheck.run(ctx)).rejects.toThrow('parse');
    expect(passes).toHaveLength(0);
  });
});
