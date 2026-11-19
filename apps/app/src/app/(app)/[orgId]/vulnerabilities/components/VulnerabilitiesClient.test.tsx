import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeVulnerability, VULNERABILITIES } from '../lib/vulnerabilities.fixtures';
import { VulnerabilitiesClient } from './VulnerabilitiesClient';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
const state = {
  vulnerabilities: VULNERABILITIES,
  isLoading: false,
  error: undefined as Error | undefined,
  create: vi.fn(),
  update: vi.fn(),
  importCsv: vi.fn(),
  sync: vi.fn(),
};
vi.mock('@/hooks/use-vulnerabilities', () => ({ useVulnerabilities: () => state }));
vi.mock('@/hooks/use-vulnerability-program', () => ({
  useSlaPolicy: () => ({
    policy: { criticalDays: 14, highDays: 30, mediumDays: 60, lowDays: 120 },
    isLoading: false,
    save: vi.fn(),
  }),
  useVulnerabilityScans: () => ({ scans: undefined, isLoading: true }),
  openVulnerabilityFile: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ orgId: 'org_1' }),
}));
vi.mock('@/lib/evidence-download', () => ({ downloadRegisterCsv: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderClient = () => render(<VulnerabilitiesClient assets={[]} memberOptions={[]} />);

beforeEach(() => {
  state.vulnerabilities = VULNERABILITIES;
  state.error = undefined;
  setMockPermissions({ integration: ['read', 'create', 'update'] });
});

describe('VulnerabilitiesClient', () => {
  it('shows open findings with severity, source and SLA status', () => {
    renderClient();
    const row = screen
      .getByText('3 unresolved Dependabot alerts on api')
      .closest('tr') as HTMLElement;
    expect(within(row).getByText('Critical')).toBeInTheDocument();
    expect(within(row).getByText('GitHub')).toBeInTheDocument();
    expect(within(row).getByText('Overdue')).toBeInTheDocument();
    expect(within(row).getByText('In CDE')).toBeInTheDocument();
    expect(screen.getByText('OpenSSL overflow')).toBeInTheDocument();
    expect(screen.queryByText('Old finding')).not.toBeInTheDocument();
  });

  it('switches to the resolved history', () => {
    renderClient();
    fireEvent.click(screen.getByRole('tab', { name: /Resolved/ }));
    expect(screen.getByText('Old finding')).toBeInTheDocument();
    expect(screen.queryByText('OpenSSL overflow')).not.toBeInTheDocument();
  });

  it('lets admins import and log findings', () => {
    renderClient();
    expect(screen.getByRole('button', { name: /Import scan/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log vulnerability/ })).toBeInTheDocument();
  });

  it('hides mutations for read-only users', () => {
    setMockPermissions({ integration: ['read'] });
    renderClient();
    expect(screen.queryByRole('button', { name: /Import scan/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log vulnerability/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Refresh/ })).not.toBeInTheDocument();
  });

  it('guides the user when nothing is tracked yet', () => {
    state.vulnerabilities = [];
    renderClient();
    expect(screen.getByText('No vulnerabilities tracked yet')).toBeInTheDocument();
  });

  it('shows the org SLA in the header', () => {
    renderClient();
    expect(
      screen.getByText(/critical within 14 days, high 30, medium 60, low 120/),
    ).toBeInTheDocument();
  });

  it('lists false positives and accepted risks together', () => {
    renderClient();
    fireEvent.click(screen.getByRole('tab', { name: /False positive \/ accepted/ }));
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByText('OpenSSL overflow')).not.toBeInTheDocument();
  });

  it('flags ASV failures in the list', () => {
    state.vulnerabilities = [
      ...VULNERABILITIES,
      makeVulnerability({ id: 'ipf_asv', title: 'TLS 1.0', source: 'asv_scan', asvFail: true }),
    ];
    renderClient();
    const row = screen.getByText('TLS 1.0').closest('tr') as HTMLElement;
    expect(within(row).getByText('ASV fail')).toBeInTheDocument();
  });
});
