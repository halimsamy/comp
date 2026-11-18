import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompanyOverviewCards } from './CompanyOverviewCards';

const statuses = {
  'penetration-test': {
    lastSubmittedAt: '2026-04-01T00:00:00.000Z',
    isNotRelevant: false,
    cadenceMonths: 12,
    nextDueAt: '2027-04-01T00:00:00.000Z',
    isFresh: true,
  },
  'rbac-matrix': {
    lastSubmittedAt: '2026-04-01T00:00:00.000Z',
    isNotRelevant: false,
    cadenceMonths: 6,
    nextDueAt: '2026-10-01T00:00:00.000Z',
    isFresh: false,
  },
};

vi.mock('swr', () => ({ default: () => ({ data: statuses }) }));
vi.mock('@/hooks/use-findings-api', () => ({ useOrganizationFindings: () => ({ data: undefined }) }));
vi.mock('../isms/hooks/useIso27001FrameworkId', () => ({ useIso27001FrameworkId: () => null }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe('CompanyOverviewCards', () => {
  it('uses each form cadence from the API for status and due date', () => {
    render(<CompanyOverviewCards organizationId="org_1" />);
    const pentest = screen.getByText('Penetration Test').closest('a')!;
    const rbac = screen.getByText('RBAC Matrix').closest('a')!;
    expect(pentest).toHaveTextContent('Complete');
    expect(pentest).toHaveTextContent(/Due Apr 2027/);
    expect(rbac).toHaveTextContent('Todo');
    expect(rbac).toHaveTextContent(/Overdue since Oct 2026/);
  });
});
