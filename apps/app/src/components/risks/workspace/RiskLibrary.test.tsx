import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import type { RiskLibraryTemplate } from '@/hooks/use-risk-workspace';
import { RiskLibrary } from './RiskLibrary';

const mockAddRisks = vi.fn();
const mockSuggest = vi.fn();
const mockMutate = vi.fn();
const mockRefresh = vi.fn();

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('@/hooks/use-risk-workspace', () => ({
  useRiskLibrary: () => ({ templates: mockTemplates, error: null, isLoading: false, mutate: mockMutate }),
  useRefreshRiskLists: () => mockRefresh,
  useRiskWorkspaceMutations: () => ({ addRisks: mockAddRisks, suggestRisks: mockSuggest }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const template = (overrides: Partial<RiskLibraryTemplate>): RiskLibraryTemplate => ({
  id: 'pan-exposure',
  group: 'Cardholder data',
  title: 'Cardholder data exposed outside the CDE',
  description: 'PAN in logs',
  category: 'technology',
  likelihood: 'possible',
  impact: 'severe',
  treatment: 'Mask PAN in logs',
  references: ['PCI DSS 3.4.1'],
  added: false,
  ...overrides,
});
let mockTemplates: RiskLibraryTemplate[] = [];

describe('RiskLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTemplates = [
      template({}),
      template({ id: 'card-fraud', group: 'Payments & fraud', title: 'Card fraud', added: true }),
    ];
  });

  it('groups templates and marks those already in the register', () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<RiskLibrary />);
    expect(screen.getByText('Cardholder data')).toBeInTheDocument();
    expect(screen.getByText('Payments & fraud')).toBeInTheDocument();
    expect(screen.getByText('In register')).toBeInTheDocument();
    expect(screen.getAllByText('PCI DSS 3.4.1')).toHaveLength(2);
  });

  it('adds a template as a risk with its treatment', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockAddRisks.mockResolvedValue({ created: [{ id: 'rsk_1', title: 'x' }], skipped: [] });
    render(<RiskLibrary />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to register' }));
    await waitFor(() =>
      expect(mockAddRisks).toHaveBeenCalledWith([
        expect.objectContaining({
          title: 'Cardholder data exposed outside the CDE',
          treatmentStrategyDescription: 'Mask PAN in logs',
          references: ['PCI DSS 3.4.1'],
        }),
      ]),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('asks before linking recommended controls', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockTemplates = [template({ recommendedControls: 2 })];
    mockAddRisks.mockResolvedValue({
      created: [{ id: 'rsk_1', title: 'x', ref: 'R-007', linkedTasks: 3 }],
      skipped: [],
    });
    render(<RiskLibrary />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to register' }));
    expect(mockAddRisks).not.toHaveBeenCalled();
    expect(await screen.findByText('Link 2 recommended controls?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add and link' }));
    await waitFor(() => expect(mockAddRisks).toHaveBeenCalledTimes(1));
  });

  it('adds picked AI suggestions without their source label', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    mockSuggest.mockResolvedValue([
      {
        title: 'Processor outage',
        description: 'Stripe down',
        category: 'vendor_management',
        likelihood: 'possible',
        impact: 'major',
        treatmentStrategyDescription: 'Fallback processor',
        source: 'Vendor: Stripe',
      },
    ]);
    mockAddRisks.mockResolvedValue({ created: [{ id: 'rsk_2', title: 'Processor outage' }], skipped: [] });
    render(<RiskLibrary />);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest risks' }));
    expect(await screen.findByText('Vendor: Stripe')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to register' }));
    await waitFor(() =>
      expect(mockAddRisks).toHaveBeenCalledWith([
        expect.not.objectContaining({ source: expect.anything() }),
      ]),
    );
  });

  it('hides add and AI suggestions without risk:create', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(<RiskLibrary />);
    expect(screen.queryByRole('button', { name: 'Add to register' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suggest risks' })).not.toBeInTheDocument();
  });
});
