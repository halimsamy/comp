import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RiskAcceptanceEvent } from '@/hooks/use-risk-acceptances';
import { ResidualAcceptanceCard } from './ResidualAcceptanceCard';

const mockRecordAcceptance = vi.fn();
let mockAcceptances: RiskAcceptanceEvent[] = [];
let mockIsLoading = false;

vi.mock('@/hooks/use-risk-acceptances', () => ({
  useAcceptances: () => ({
    acceptances: mockAcceptances,
    latest: mockAcceptances[0] ?? null,
    isLoading: mockIsLoading,
    error: null,
    mutate: vi.fn(),
    recordAcceptance: mockRecordAcceptance,
  }),
}));

let mockSettings: { acceptanceRequiredFromLevel: string; reviewIntervalMonths: number } | null = null;

vi.mock('@/hooks/use-risk-workspace', () => ({
  useRiskSettings: () => ({ settings: mockSettings }),
  isAcceptanceRequired: ({ level, threshold }: { level: string; threshold: string }) => {
    const order = ['very-low', 'low', 'medium', 'high', 'very-high'];
    return order.indexOf(level) >= order.indexOf(threshold);
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const acceptedEvent: RiskAcceptanceEvent = {
  id: 'rska_1',
  acceptedById: 'mem_1',
  acceptedByName: 'Jane Doe',
  notes: 'Reviewed at Q2',
  residualLikelihood: 'unlikely',
  residualImpact: 'minor',
  level: 'low',
  levelLabel: 'Low',
  stale: false,
  createdAt: '2026-04-15T00:00:00.000Z',
};

function renderCard({ canUpdate = true } = {}) {
  return render(
    <ResidualAcceptanceCard
      kind="risk"
      subjectId="rsk_1"
      residualLikelihood="unlikely"
      residualImpact="minor"
      ownerId="mem_1"
      acceptorOptions={[{ id: 'mem_1', name: 'Jane Doe' }]}
      canUpdate={canUpdate}
    />,
  );
}

describe('ResidualAcceptanceCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcceptances = [];
    mockIsLoading = false;
    mockSettings = null;
  });

  it('says no acceptance is needed below the methodology threshold', () => {
    // unlikely x minor = very low, under a medium threshold.
    mockSettings = { acceptanceRequiredFromLevel: 'medium', reviewIntervalMonths: 3 };
    renderCard();
    expect(screen.getByText('Not required')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting acceptance')).not.toBeInTheDocument();
  });

  it('still asks for acceptance at or above the threshold', () => {
    mockSettings = { acceptanceRequiredFromLevel: 'very-low', reviewIntervalMonths: 3 };
    renderCard();
    expect(screen.getByText('Awaiting acceptance')).toBeInTheDocument();
  });

  it('shows the awaiting state when no acceptance is recorded', () => {
    renderCard();

    expect(screen.getByText('Awaiting acceptance')).toBeInTheDocument();
    expect(
      // unlikely x minor = raw 4 -> score 2 -> Very low (score bands)
      screen.getByText(/No acceptance recorded yet\. The current residual level is Very low\./),
    ).toBeInTheDocument();
  });

  it('shows who accepted, when, and at which level', () => {
    mockAcceptances = [acceptedEvent];
    renderCard();

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(
      screen.getByText(/Residual risk accepted by Jane Doe on .* at Low\./),
    ).toBeInTheDocument();
  });

  it('flags a stale acceptance and asks for a re-record', () => {
    // Stale is client-derived: the frozen rating differs from the live
    // residual props (unlikely/minor), regardless of the cached server flag.
    mockAcceptances = [
      { ...acceptedEvent, residualLikelihood: 'possible', residualImpact: 'moderate' },
    ];
    renderCard();

    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText(/record a fresh acceptance/i)).toBeInTheDocument();
  });

  it('renders earlier acceptances as history', () => {
    mockAcceptances = [
      acceptedEvent,
      {
        ...acceptedEvent,
        id: 'rska_0',
        acceptedByName: 'Old Owner',
        stale: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    renderCard();

    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Old Owner')).toBeInTheDocument();
  });

  it('shows the record action for users with update permission', () => {
    renderCard({ canUpdate: true });

    expect(
      screen.getByRole('button', { name: /record risk-owner acceptance/i }),
    ).toBeInTheDocument();
  });

  it('hides the record action for read-only users', () => {
    renderCard({ canUpdate: false });

    expect(
      screen.queryByRole('button', { name: /record risk-owner acceptance/i }),
    ).not.toBeInTheDocument();
  });
});
