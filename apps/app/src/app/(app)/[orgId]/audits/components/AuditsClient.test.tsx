import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIT } from '../lib/audits.fixtures';
import { AuditsClient } from './AuditsClient';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
const state = {
  audits: [AUDIT],
  isLoading: false,
  error: undefined as Error | undefined,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};
vi.mock('@/hooks/use-audits', () => ({ useAudits: () => state }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const props = { orgId: 'org_1', frameworks: [{ id: 'frm_1', name: 'ISO 27001' }], auditors: [] };

beforeEach(() => {
  state.audits = [AUDIT];
  state.isLoading = false;
  state.error = undefined;
  setMockPermissions({ audit: ['create', 'read', 'update'] });
});

describe('AuditsClient', () => {
  it('shows each audit with firm, period, auditors and progress', () => {
    render(<AuditsClient {...props} />);
    expect(screen.getByText('ISO 27001 surveillance 2026')).toBeInTheDocument();
    expect(screen.getByText(/Acme Certification/)).toBeInTheDocument();
    expect(screen.getByText('Auditors: Ann Auditor')).toBeInTheDocument();
    expect(screen.getByText('Accepted: 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open audit/ })).toHaveAttribute('href', '/org_1/audits/aud_1');
  });

  it('lets admins add and edit audits', () => {
    render(<AuditsClient {...props} />);
    expect(screen.getByRole('button', { name: /Add audit/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument();
  });

  it('hides add and edit for auditors (read only)', () => {
    setMockPermissions({ audit: ['read'] });
    render(<AuditsClient {...props} />);
    expect(screen.queryByRole('button', { name: /Add audit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
  });

  it('guides the team when there are no audits', () => {
    state.audits = [];
    render(<AuditsClient {...props} />);
    expect(screen.getByText('No audits yet')).toBeInTheDocument();
    expect(screen.getByText(/Invite the auditors under People/)).toBeInTheDocument();
  });

  it('shows an error state', () => {
    state.audits = [];
    state.error = new Error('boom');
    render(<AuditsClient {...props} />);
    expect(screen.getByText(/Could not load audits/)).toBeInTheDocument();
  });
});
