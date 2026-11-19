import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditRequest } from '@/hooks/use-audits';
import { AuditRequestsPanel } from './AuditRequestsPanel';

const request: AuditRequest = {
  id: 'aer_1',
  requirementId: null,
  title: 'Population of new hires',
  description: null,
  status: 'submitted',
  dueDate: null,
  response: 'Attached the HR export',
  respondedAt: '2026-11-10T00:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
  requestedBy: { name: 'Ann Auditor', email: 'ann@cb.com' },
  attachments: [],
  source: 'auditor',
  ownerMemberId: null,
};
const state = {
  requests: [request],
  isLoading: false,
  error: undefined as Error | undefined,
  create: vi.fn(),
  createTeam: vi.fn().mockResolvedValue(1),
  respond: vi.fn(),
  decide: vi.fn(),
  upload: vi.fn(),
};
vi.mock('@/hooks/use-audits', () => ({ useAuditRequests: () => state }));
vi.mock('@/hooks/use-organization-members', () => ({ useOrganizationMembers: () => ({ members: [] }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  state.requests = [request];
});

describe('AuditRequestsPanel', () => {
  it('lets the auditor raise requests and accept responses', () => {
    render(<AuditRequestsPanel auditId="aud_1" requirements={[]} isAuditor canRespond={false} />);
    expect(screen.getByRole('button', { name: /Request evidence/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send response/ })).not.toBeInTheDocument();
  });

  it('lets the team answer but not accept', () => {
    render(<AuditRequestsPanel auditId="aud_1" requirements={[]} isAuditor={false} canRespond />);
    expect(screen.queryByRole('button', { name: /Request evidence/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send response/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Attach file/ })).toBeInTheDocument();
  });

  it('lets the team log the request list the auditor emailed (#109)', () => {
    render(<AuditRequestsPanel auditId="aud_1" requirements={[]} isAuditor={false} canRespond />);
    expect(screen.getByRole('button', { name: /Add request/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import request list/ })).toBeInTheDocument();
  });

  it('is read only without audit:update', () => {
    render(<AuditRequestsPanel auditId="aud_1" requirements={[]} isAuditor={false} canRespond={false} />);
    expect(screen.queryByRole('button', { name: /Send response/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import request list/ })).not.toBeInTheDocument();
    expect(screen.getByText('Attached the HR export')).toBeInTheDocument();
  });

  it('shows guidance when there are no requests', () => {
    state.requests = [];
    render(<AuditRequestsPanel auditId="aud_1" requirements={[]} isAuditor={false} canRespond />);
    expect(screen.getByText('No evidence requests')).toBeInTheDocument();
  });
});
