import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicabilityRules } from './applicability-schema';
import { RequirementApplicabilityCard } from './RequirementApplicabilityCard';

const mockPut = vi.fn();
const mockRefresh = vi.fn();
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/lib/api-client', () => ({ apiClient: { put: (...args: unknown[]) => mockPut(...args) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const pciRules: ApplicabilityRules = {
  editable: true,
  allowedStatuses: ['applicable', 'not_applicable', 'compensating_control', 'customized_approach'],
  managedBy: null,
  reason: null,
};
const soaRules: ApplicabilityRules = {
  editable: false,
  allowedStatuses: ['applicable', 'not_applicable'],
  managedBy: 'soa',
  reason: 'Annex A applicability is set in the Statement of Applicability.',
};

const renderCard = (rules: ApplicabilityRules, record = null as null | Parameters<typeof RequirementApplicabilityCard>[0]['record']) =>
  render(
    <RequirementApplicabilityCard
      orgId="org_1"
      frameworkInstanceId="fi_1"
      requirementKey="req_1"
      record={record}
      rules={rules}
    />,
  );

describe('RequirementApplicabilityCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockResolvedValue({ data: {}, error: null });
  });

  it('defaults to applicable and lets an editor change it', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderCard(pciRules);
    expect(screen.getByText('Applicable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
  });

  it('hides editing from read-only users', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    renderCard(pciRules, {
      id: 'rap_1',
      status: 'not_applicable',
      justification: 'No wireless in the CDE',
      source: 'manual',
      updatedAt: '2026-11-01T00:00:00.000Z',
      updatedBy: { id: 'mem_1', user: { name: 'Dana', email: 'd@x.com' } },
    });
    expect(screen.getByText('Not applicable')).toBeInTheDocument();
    expect(screen.getByText('No wireless in the CDE')).toBeInTheDocument();
    expect(screen.getByText(/Set manually by Dana/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
  });

  it('points ISO Annex A to the Statement of Applicability', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderCard(soaRules);
    expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /statement of applicability/i })).toHaveAttribute(
      'href',
      '/org_1/documents/statement-of-applicability',
    );
  });

  it('requires a justification before saving not applicable', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    renderCard(pciRules);
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    fireEvent.click(await screen.findByRole('radio', { name: /not applicable/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/explain why/i)).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'No wireless in the CDE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        '/v1/frameworks/fi_1/requirements/req_1/applicability',
        { status: 'not_applicable', justification: 'No wireless in the CDE' },
      ),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });
});
