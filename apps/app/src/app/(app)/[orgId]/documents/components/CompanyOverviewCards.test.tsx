import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_PERMISSIONS, mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { CompanyOverviewCards } from './CompanyOverviewCards';

const statuses = {
  'penetration-test': {
    lastSubmittedAt: '2026-04-01T00:00:00.000Z',
    isNotRelevant: false,
    cadenceMonths: 12,
    nextDueAt: '2027-04-01T00:00:00.000Z',
    isFresh: true,
    status: 'ok',
    ownerMemberId: 'mem_1',
    frameworks: ['ISO 27001', 'PCI DSS'],
  },
  'tabletop-exercise': {
    lastSubmittedAt: '2025-04-01T00:00:00.000Z',
    isNotRelevant: false,
    cadenceMonths: 12,
    nextDueAt: '2026-04-01T00:00:00.000Z',
    isFresh: false,
    status: 'overdue',
    ownerMemberId: null,
    frameworks: [],
  },
};

let view: string | null = null;
vi.mock('nuqs', () => ({ useQueryState: () => [view, vi.fn()] }));
vi.mock('./use-form-settings', () => ({
  useFormStatuses: () => ({ statuses, bulkSetOwner: vi.fn() }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/hooks/use-organization-members', () => ({
  useOrganizationMembers: () => ({
    members: [{ id: 'mem_1', user: { name: 'Dana Owner', email: 'dana@example.com' } }],
  }),
}));
vi.mock('@/components/SelectAssignee', () => ({ SelectAssignee: () => null }));
vi.mock('@/hooks/use-findings-api', () => ({ useOrganizationFindings: () => ({ data: undefined }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe('CompanyOverviewCards', () => {
  beforeEach(() => {
    view = null;
    setMockPermissions(ADMIN_PERMISSIONS);
  });

  it('uses each form cadence from the API for status and due date', () => {
    render(<CompanyOverviewCards organizationId="org_1" />);
    const pentest = screen.getByText('Penetration Test').closest('a')!;
    const tabletop = screen.getByText('Incident Response Tabletop Exercise').closest('a')!;
    expect(pentest).toHaveTextContent('Complete');
    expect(pentest).toHaveTextContent(/Due Apr 2027/);
    expect(tabletop).toHaveTextContent(/Overdue since Apr 2026/);
  });

  it('hides retired forms and sends Meeting Minutes to the ISMS management review', () => {
    render(<CompanyOverviewCards organizationId="org_1" />);
    expect(screen.queryByText('RBAC Matrix')).not.toBeInTheDocument();
    expect(screen.queryByText('Infrastructure Inventory')).not.toBeInTheDocument();
    expect(screen.getByText('Meeting Minutes').closest('a')).toHaveAttribute(
      'href',
      '/org_1/documents/isms/management-review',
    );
  });

  it('shows owner, cadence, frameworks and status in the table view', () => {
    view = 'table';
    render(<CompanyOverviewCards organizationId="org_1" />);
    const pentestRow = screen.getByText('Penetration Test').closest('tr')!;
    expect(pentestRow).toHaveTextContent('Dana Owner');
    expect(pentestRow).toHaveTextContent('Yearly');
    expect(pentestRow).toHaveTextContent('ISO 27001, PCI DSS');
    expect(pentestRow).toHaveTextContent('OK');
    expect(screen.getByText('Incident Response Tabletop Exercise').closest('tr')).toHaveTextContent('Overdue');
    expect(screen.getByLabelText('Select all forms')).toBeInTheDocument();
  });

  it('hides selection without evidence:update', () => {
    view = 'table';
    setMockPermissions({ evidence: ['read'] });
    render(<CompanyOverviewCards organizationId="org_1" />);
    expect(screen.queryByLabelText('Select all forms')).not.toBeInTheDocument();
  });
});
