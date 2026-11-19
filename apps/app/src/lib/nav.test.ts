import { describe, expect, it } from 'vitest';
import { activeNavItemId, NAV_ITEMS, visibleNavItems } from './nav';
import { visibleSettingsItems } from './nav-settings';

const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);

describe('nav registry', () => {
  it('has unique ids and org-relative paths', () => {
    expect(new Set(ids(NAV_ITEMS)).size).toBe(NAV_ITEMS.length);
    for (const item of NAV_ITEMS) expect(item.path.startsWith('/')).toBe(true);
    expect(ids(NAV_ITEMS)).not.toContain('auditor');
  });

  it('gates items by route permission, extra permission and feature', () => {
    const admin = {
      app: ['read'],
      framework: ['read'],
      audit: ['read'],
      member: ['read'],
      integration: ['read'],
      evidence: ['read'],
    };
    const visible = ids(visibleNavItems({ permissions: admin, features: {} }));
    expect(visible).toEqual(
      expect.arrayContaining(['audits', 'assets', 'vulnerabilities', 'people', 'access-reviews']),
    );
    // finding:read missing, isms/questionnaire/setup features off.
    expect(visible).not.toContain('findings');
    expect(visible).not.toContain('isms');
    expect(visible).not.toContain('questionnaire');
    expect(visible).not.toContain('getting-started');

    const withFeatures = ids(
      visibleNavItems({
        permissions: { ...admin, finding: ['read'] },
        features: { isms: true, setup: true },
      }),
    );
    expect(withFeatures).toEqual(
      expect.arrayContaining(['findings', 'isms', 'soa', 'getting-started']),
    );
  });

  it('shows read-only members nothing they cannot open', () => {
    expect(ids(visibleNavItems({ permissions: { policy: ['read'] }, features: {} }))).toEqual([
      'policies',
    ]);
  });

  it('gates settings pages by their route permission', () => {
    const owner = { organization: ['update'], audit: ['read'], member: ['read'], apiKey: ['read'] };
    expect(ids(visibleSettingsItems({ permissions: owner, features: {} }))).toEqual(
      expect.arrayContaining([
        'general',
        'security',
        'event-log',
        'roles',
        'notifications',
        'api',
        'user',
      ]),
    );
    const employee = ids(
      visibleSettingsItems({ permissions: { evidence: ['read'] }, features: {} }),
    );
    expect(employee).not.toContain('security');
    expect(employee).not.toContain('event-log');
    expect(employee).not.toContain('roles');
    expect(employee).toContain('user');
  });
});

describe('activeNavItemId', () => {
  const active = (pathname: string, search = '') =>
    activeNavItemId({
      items: NAV_ITEMS,
      orgId: 'org_1',
      pathname,
      search: new URLSearchParams(search),
    });

  it('picks the most specific item', () => {
    expect(active('/org_1/overview')).toBe('overview');
    expect(active('/org_1/audits', 'tab=findings')).toBe('findings');
    expect(active('/org_1/audits')).toBe('audits');
    expect(active('/org_1/tasks/tsk_1')).toBe('tasks');
    expect(active('/org_1/documents/isms/scope')).toBe('isms');
    expect(active('/org_1/documents/statement-of-applicability')).toBe('soa');
    expect(active('/org_1/documents')).toBe('documents');
  });

  it('matches query-addressed items exactly', () => {
    expect(active('/org_1/documents', 'tab=iso-27001')).toBe('isms');
    expect(active('/org_1/people', 'tab=access')).toBe('access-reviews');
    expect(active('/org_1/people/access/reviews/arv_1')).toBe('access-reviews');
    expect(active('/org_1/people', 'tab=devices')).toBe('people');
  });

  it('returns null outside the registry', () => {
    expect(active('/org_1/settings')).toBeNull();
  });
});
