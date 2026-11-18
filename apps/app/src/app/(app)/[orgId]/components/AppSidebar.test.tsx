import type { Organization } from '@db';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';

const nav = { pathname: '/org_1/overview', search: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
}));
const flags = { isms: false };
vi.mock('@trycompai/analytics', () => ({ useFeatureFlag: () => flags.isms }));
const iso = { id: 'fw_iso' as string | null };
vi.mock('../documents/isms/hooks/useIso27001FrameworkId', () => ({
  useIso27001FrameworkId: () => iso.id,
}));
vi.mock('./GettingStartedNavFooter', () => ({
  GettingStartedNavFooter: ({ canManage }: { canManage: boolean }) =>
    canManage ? <div>setup footer</div> : null,
}));

const organization = { id: 'org_1' } as Organization;
const ALL = ['read', 'create', 'update', 'delete'];
const adminPermissions = Object.fromEntries(
  [
    'framework',
    'control',
    'policy',
    'evidence',
    'task',
    'member',
    'risk',
    'vendor',
    'integration',
    'finding',
    'organization',
    'app',
  ].map((resource) => [resource, ALL]),
);

const renderSidebar = (permissions = adminPermissions) =>
  render(
    <AppSidebar
      organization={organization}
      isQuestionnaireEnabled={false}
      hasAuditorRole={false}
      isOnlyAuditor={false}
      permissions={permissions}
      canAccessAuditorView={false}
    />,
  );

const link = (name: string) => screen.getByText(name).closest('a');
const isActive = (name: string) =>
  screen
    .getByText(name)
    .closest('[data-slot="app-shell-nav-item"]')
    ?.getAttribute('data-active') === 'true';

describe('AppSidebar', () => {
  beforeEach(() => {
    nav.pathname = '/org_1/overview';
    nav.search = new URLSearchParams();
    flags.isms = false;
    iso.id = 'fw_iso';
  });

  it('groups navigation by compliance domain and includes Controls', () => {
    renderSidebar();
    for (const group of ['Program', 'Governance', 'Evidence', 'Risk', 'Personnel', 'Monitoring']) {
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
    expect(link('Controls')).toHaveAttribute('href', '/org_1/controls');
    expect(link('Findings')).toHaveAttribute('href', '/org_1/overview/findings');
    expect(screen.getByText('setup footer')).toBeInTheDocument();
  });

  it('hides items and whole groups the member cannot access', () => {
    renderSidebar({ policy: ['read'], app: ['read'] });
    expect(screen.getByText('Policies')).toBeInTheDocument();
    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
    expect(screen.queryByText('Monitoring')).not.toBeInTheDocument();
    expect(screen.queryByText('setup footer')).not.toBeInTheDocument();
  });

  it('highlights Findings, not Overview, on the findings page', () => {
    nav.pathname = '/org_1/overview/findings';
    renderSidebar();
    expect(isActive('Findings')).toBe(true);
    expect(isActive('Overview')).toBe(false);
  });

  it('shows ISMS and SoA when the ISMS area is enabled and ISO 27001 is active', () => {
    flags.isms = true;
    nav.pathname = '/org_1/documents';
    nav.search = new URLSearchParams('tab=iso-27001');
    renderSidebar();
    expect(link('ISMS')).toHaveAttribute('href', '/org_1/documents?tab=iso-27001');
    expect(link('Statement of Applicability')).toHaveAttribute(
      'href',
      '/org_1/documents/statement-of-applicability',
    );
    expect(isActive('ISMS')).toBe(true);
    expect(isActive('Documents')).toBe(false);
  });

  it('omits ISMS links without ISO 27001', () => {
    flags.isms = true;
    iso.id = null;
    renderSidebar();
    expect(screen.queryByText('Statement of Applicability')).not.toBeInTheDocument();
  });
});
