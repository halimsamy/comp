import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_PERMISSIONS, mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'org_1' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
const mockGet = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args) } }));
vi.mock('@trycompai/design-system', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Section: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('@trycompai/design-system/icons', () => ({ Launch: () => null }));

import { TaskStructuredEvidence } from './TaskStructuredEvidence';

const forms = [
  { formType: 'penetration-test', title: 'Penetration Test', status: 'overdue', lastSubmittedAt: null, nextDueAt: null, retiredTo: null, hasMatrix: false },
  { formType: 'access-register', title: 'Access Register', status: 'ok', lastSubmittedAt: '2026-10-01', nextDueAt: '2027-04-01', retiredTo: null, hasMatrix: true },
  { formType: 'rbac-matrix', title: 'RBAC Matrix', status: 'never_submitted', lastSubmittedAt: null, nextDueAt: null, retiredTo: { label: 'People > Access', path: '/people?tab=access' }, hasMatrix: true },
];

const renderCard = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TaskStructuredEvidence taskId="tsk_1" />
    </SWRConfig>,
  );

describe('TaskStructuredEvidence (#173)', () => {
  beforeEach(() => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockGet.mockResolvedValue({ data: { data: forms } });
  });

  it('lists the linked forms with Fill form, CSV import for registers and module links for retired forms', async () => {
    renderCard();
    expect(await screen.findByText('Structured evidence for this task')).toBeInTheDocument();
    expect(screen.getAllByText('Fill form')).toHaveLength(2);
    expect(screen.getByText('Import CSV into rows').closest('a')).toHaveAttribute(
      'href',
      '/org_1/documents/access-register/new?taskId=tsk_1&import=csv',
    );
    expect(screen.getByText('Open People > Access').closest('a')).toHaveAttribute('href', '/org_1/people?tab=access');
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('hides fill actions without portal:update', async () => {
    setMockPermissions({ task: ['read'], evidence: ['read'] });
    renderCard();
    expect(await screen.findByText('Penetration Test')).toBeInTheDocument();
    expect(screen.queryByText('Fill form')).not.toBeInTheDocument();
    expect(screen.queryByText('Import CSV into rows')).not.toBeInTheDocument();
  });

  it('renders nothing when no form is linked', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
