import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeAccess } from './EmployeeAccess';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiClient: { get: mockGet }, api: { get: mockGet } }));
vi.mock('@/utils/auth-client', () => ({ useActiveOrganization: () => ({ data: { id: 'org_1' } }) }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'org_1' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const account = (overrides: object) => ({
  accountId: 'jane@acme.com',
  name: 'jane@acme.com',
  email: 'jane@acme.com',
  type: null,
  status: 'active',
  roles: ['Super Admin'],
  isAdmin: true,
  mfaEnabled: null,
  lastLoginAt: null,
  accountCreatedAt: null,
  owner: { memberId: 'mem_1', name: 'Jane', email: 'jane@acme.com', departed: false },
  ownerSource: 'email',
  isServiceAccount: false,
  justification: null,
  flags: ['admin'],
  system: { key: 'connection:gws', name: 'Google Workspace', kind: 'integration', logoUrl: null },
  ...overrides,
});

const renderAccess = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <EmployeeAccess memberId="mem_1" organizationId="org_1" />
    </SWRConfig>,
  );

beforeEach(() => vi.clearAllMocks());

describe('EmployeeAccess (#83)', () => {
  it('reads the member’s accounts from the access inventory, grouped by system', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          account({}),
          account({ accountId: 'jdoe', name: 'jdoe', roles: ['Viewer'], flags: [], mfaEnabled: true, system: { key: 'manual:bank', name: 'Bank portal', kind: 'manual', logoUrl: null } }),
        ],
      },
    });

    renderAccess();

    await waitFor(() => expect(screen.getByText('Google Workspace')).toBeInTheDocument());
    expect(mockGet).toHaveBeenCalledWith('/v1/access/accounts?member=mem_1');
    expect(screen.getByText('Bank portal')).toBeInTheDocument();
    expect(screen.getByText('MFA unknown')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('links to the inventory when the person has no accounts', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderAccess();
    await waitFor(() => expect(screen.getByText(/No accounts in the access inventory/)).toBeInTheDocument());
    expect(screen.getByRole('link')).toHaveAttribute('href', '/org_1/people?tab=access');
  });
});
