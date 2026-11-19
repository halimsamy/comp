import type { NavFeatures } from '@/lib/nav';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';

const nav = { pathname: '/org_1/overview', search: new URLSearchParams() };
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
}));
vi.mock('./GettingStartedNavFooter', () => ({
  GettingStartedNavFooter: ({ canManage }: { canManage: boolean }) =>
    canManage ? <div>setup footer</div> : null,
}));

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
    'audit',
    'app',
  ].map((resource) => [resource, ALL]),
);

const renderSidebar = (permissions = adminPermissions, features: NavFeatures = {}) =>
  render(<AppSidebar organizationId="org_1" permissions={permissions} features={features} />);

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
  });

  it('renders every compliance page from the nav registry', () => {
    renderSidebar();
    for (const group of ['Program', 'Governance', 'Evidence', 'Risk', 'Personnel', 'Monitoring']) {
      expect(screen.getAllByText(group).length).toBeGreaterThan(0);
    }
    expect(link('Controls')).toHaveAttribute('href', '/org_1/controls');
    expect(link('Audits')).toHaveAttribute('href', '/org_1/audits');
    expect(link('Findings')).toHaveAttribute('href', '/org_1/audits?tab=findings');
    expect(link('People')).toHaveAttribute('href', '/org_1/people');
    expect(link('Access reviews')).toHaveAttribute('href', '/org_1/people?tab=access');
    expect(link('Assets')).toHaveAttribute('href', '/org_1/assets');
    expect(link('Vulnerabilities')).toHaveAttribute('href', '/org_1/vulnerabilities');
    expect(screen.queryByText('Auditor View')).not.toBeInTheDocument();
    expect(screen.getByText('setup footer')).toBeInTheDocument();
  });

  it('wraps the groups in a scroll area so the last items stay reachable on short screens', () => {
    renderSidebar();
    const scroll = screen.getByTestId('app-sidebar-scroll');
    expect(scroll).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(scroll).toContainElement(screen.getByText('Vulnerabilities'));
    expect(scroll).not.toContainElement(screen.getByText('setup footer'));
  });

  it('hides items and whole groups the member cannot access', () => {
    renderSidebar({ policy: ['read'], app: ['read'] });
    expect(screen.getByText('Policies')).toBeInTheDocument();
    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
    expect(screen.queryByText('Audits')).not.toBeInTheDocument();
    expect(screen.queryByText('Monitoring')).not.toBeInTheDocument();
    expect(screen.queryByText('setup footer')).not.toBeInTheDocument();
  });

  it('highlights Findings, not Audits, on the findings tab', () => {
    nav.pathname = '/org_1/audits';
    nav.search = new URLSearchParams('tab=findings');
    renderSidebar();
    expect(isActive('Findings')).toBe(true);
    expect(isActive('Audits')).toBe(false);
  });

  it('highlights Access reviews, not People, on the access tab', () => {
    nav.pathname = '/org_1/people';
    nav.search = new URLSearchParams('tab=access');
    renderSidebar();
    expect(isActive('Access reviews')).toBe(true);
    expect(isActive('People')).toBe(false);
  });

  it('shows ISMS and SoA only with the isms feature and highlights ISMS on its Documents tab', () => {
    nav.pathname = '/org_1/documents';
    nav.search = new URLSearchParams('tab=iso-27001');
    renderSidebar(adminPermissions, { isms: true });
    expect(link('ISMS')).toHaveAttribute('href', '/org_1/documents/isms');
    expect(link('Statement of Applicability')).toHaveAttribute(
      'href',
      '/org_1/documents/statement-of-applicability',
    );
    expect(isActive('ISMS')).toBe(true);
    expect(isActive('Documents')).toBe(false);
  });

  it('omits ISMS links and Questionnaires without their features', () => {
    renderSidebar();
    expect(screen.queryByText('ISMS')).not.toBeInTheDocument();
    expect(screen.queryByText('Statement of Applicability')).not.toBeInTheDocument();
    expect(screen.queryByText('Questionnaires')).not.toBeInTheDocument();
  });
});
