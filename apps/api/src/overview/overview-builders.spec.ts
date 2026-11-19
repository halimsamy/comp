jest.mock('@db', () => ({ db: {} }));
jest.mock('../utils/compliance-filters', () => ({
  filterComplianceMembers: jest.fn(),
}));

import { buildAttentionCards } from './overview-attention';
import { daysFromNow, makeData, NOW } from './overview-builders.fixturespec';

describe('buildAttentionCards', () => {
  const cards = Object.fromEntries(
    buildAttentionCards({ data: makeData(), now: NOW }).map((c) => [
      c.module,
      c,
    ]),
  );

  it('counts tasks as OK only when done and not due again, without not-relevant tasks', () => {
    expect(cards.tasks).toMatchObject({ total: 6, ok: 2, needsAttention: 4 });
    expect(cards.tasks.reasons).toEqual([
      { label: 'Overdue', count: 1 },
      { label: 'Failed', count: 1 },
      { label: 'Waiting for review', count: 1 },
      { label: 'Not complete', count: 1 },
    ]);
  });

  it('flags draft policies, overdue reviews and stale approvals', () => {
    expect(cards.policies).toMatchObject({
      total: 3,
      needsAttention: 2,
      ok: 1,
    });
    const data = makeData();
    data.policies[2] = {
      ...data.policies[2],
      status: 'needs_review',
      submittedForApprovalAt: daysFromNow(-9),
    };
    const policies = buildAttentionCards({ data, now: NOW }).find(
      (c) => c.module === 'policies',
    );
    expect(policies?.reasons).toContainEqual({
      label: 'Waiting for approval over 7 days',
      count: 1,
    });
  });

  it('counts pending acknowledgements by policy visibility', () => {
    // pol_pub: 3 members, 1 signed. pol_old: only the it department (a, b), both signed.
    expect(cards.acknowledgements).toMatchObject({
      total: 5,
      needsAttention: 2,
      ok: 3,
    });
  });

  it('counts training over every in-scope member, including people who never trained', () => {
    // a ok, b expired, c expiring within 30 days, d never trained.
    expect(cards.training).toMatchObject({ total: 4, ok: 1, needsAttention: 3 });
    expect(cards.training.reasons).toEqual([
      { label: 'Never trained', count: 1 },
      { label: 'Expired', count: 1 },
      { label: 'Expiring in 30 days', count: 1 },
    ]);
  });

  it('applies the shared vendor attention rule with filtered deep links', () => {
    // AWS review overdue; Slack SOC 2 expiring; Stripe not assessed and never reviewed.
    expect(cards.vendors).toMatchObject({ total: 3, needsAttention: 3 });
    expect(cards.vendors.reasons).toContainEqual({
      label: 'Not assessed',
      count: 1,
      href: '/vendors?status=not_assessed',
    });
  });

  it('reports failing and errored checks and stale access reviews', () => {
    expect(cards.checks).toMatchObject({ total: 3, needsAttention: 2 });
    // One overdue in-progress review plus no sign-off within 6 months (PCI DSS 7.2.4).
    expect(cards.accessReviews).toMatchObject({
      total: 2,
      ok: 1,
      needsAttention: 2,
    });
  });
});

