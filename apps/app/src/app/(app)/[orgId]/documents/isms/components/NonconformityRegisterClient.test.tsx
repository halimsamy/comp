import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsmsNonconformityRow } from '../hooks/useNonconformities';
import {
  awaitsEffectivenessReview,
  isOverdue,
  NonconformityRegisterClient,
} from './NonconformityRegisterClient';

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));

const state: { rows: IsmsNonconformityRow[] } = { rows: [] };
vi.mock('../hooks/useNonconformities', () => ({
  useNonconformities: () => ({
    rows: state.rows,
    hasData: true,
    error: undefined,
    isLoading: false,
    create: vi.fn(),
    update: vi.fn(),
    importMany: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const row = (overrides: Partial<IsmsNonconformityRow>): IsmsNonconformityRow => ({
  id: 'nc1',
  kind: 'standalone',
  reference: 'NC-01',
  source: 'incident',
  sourceRef: null,
  severity: null,
  description: 'Backups were not tested in Q3',
  rootCause: null,
  correctiveAction: null,
  ownerMemberId: 'mem_1',
  dueDate: null,
  status: 'open',
  closureEvidence: null,
  effectivenessReviewedAt: null,
  effectivenessReviewedById: null,
  effectivenessNotes: null,
  createdAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

const props = { organizationId: 'org_1', memberOptions: [{ id: 'mem_1', name: 'Dana' }] };

describe('NonconformityRegisterClient', () => {
  beforeEach(() => {
    setMockPermissions(ADMIN_PERMISSIONS);
    state.rows = [];
  });

  it('shows guidance when the register is empty', () => {
    render(<NonconformityRegisterClient {...props} />);
    expect(screen.getByText('No nonconformities logged')).toBeInTheDocument();
  });

  it('lists standalone and audit nonconformities with their status', () => {
    state.rows = [
      row({ dueDate: '2020-01-01' }),
      row({
        id: 'f1',
        kind: 'audit_finding',
        reference: 'IA-2026-01 F-01',
        source: 'internal_audit',
        severity: 'major',
        status: 'closed',
        correctiveAction: 'Fixed',
      }),
    ];
    render(<NonconformityRegisterClient {...props} />);
    expect(screen.getByText('NC-01')).toBeInTheDocument();
    expect(screen.getByText('IA-2026-01 F-01')).toBeInTheDocument();
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
    expect(screen.getByText('Review due')).toBeInTheDocument();
    expect(screen.getAllByText('Dana').length).toBeGreaterThan(0);
  });

  it('lists external audit findings read-only, linking to Audits → Findings (#171)', () => {
    state.rows = [
      row({
        id: 'fnd_abc123',
        kind: 'external_finding',
        reference: 'FND-ABC123',
        source: 'external_audit',
        sourceRef: 'ISO 27001 stage 2',
        severity: 'high',
        ownerMemberId: null,
      }),
    ];
    render(<NonconformityRegisterClient {...props} />);
    expect(screen.getByRole('link', { name: /FND-ABC123/ })).toHaveAttribute(
      'href',
      '/org_1/audits?tab=findings&open=fnd_abc123',
    );
    expect(screen.getByText(/ISO 27001 stage 2/)).toBeInTheDocument();
  });

  it('lets an editor log a nonconformity', () => {
    render(<NonconformityRegisterClient {...props} />);
    expect(screen.getByText('Log nonconformity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import CSV/ })).toBeInTheDocument();
    expect(mockHasPermission).toHaveBeenCalledWith('evidence', 'update');
  });

  it('hides logging for a read-only user', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<NonconformityRegisterClient {...props} />);
    expect(screen.queryByText('Log nonconformity')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import CSV/ })).not.toBeInTheDocument();
  });
});

describe('register helpers', () => {
  it('treats only open rows past their due date as overdue', () => {
    const now = new Date('2026-11-18');
    expect(isOverdue(row({ dueDate: '2026-11-01' }), now)).toBe(true);
    expect(isOverdue(row({ dueDate: '2026-11-01', status: 'closed' }), now)).toBe(false);
    expect(isOverdue(row({ dueDate: null }), now)).toBe(false);
  });

  it('flags closed rows without an effectiveness review', () => {
    expect(awaitsEffectivenessReview(row({ status: 'closed' }))).toBe(true);
    expect(
      awaitsEffectivenessReview(row({ status: 'closed', effectivenessReviewedAt: '2026-11-01' })),
    ).toBe(false);
  });
});
