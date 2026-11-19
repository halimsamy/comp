import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VendorDocumentsTab } from './VendorDocumentsTab';
import { VendorReviewsTab } from './VendorReviewsTab';
import { VendorTpspProfile } from './VendorTpspProfile';

const vendor = {
  id: 'vnd_1',
  name: 'Stripe',
  criticality: 'critical',
  handlesCardholderData: true,
  affectsCdeSecurity: false,
  dataTypes: ['cardholder_data'],
  contractStartDate: '2025-01-01T00:00:00.000Z',
  contractEndDate: null,
  securityClausesConfirmed: true,
  confidentialityClausesConfirmed: false,
  tpspAcknowledgementDate: null,
  responsibilityMatrix: [{ requirement: '3 Protect stored account data', owner: 'tpsp' }],
  assuranceType: 'pci_aoc',
  assuranceExpiresAt: '2099-01-01T00:00:00.000Z',
  pciStatus: 'compliant',
  pciStatusCheckedAt: null,
  lastReviewedAt: null,
  nextReviewDue: null,
  reviewStatus: 'never_reviewed',
};

vi.mock('@/hooks/use-vendors', () => ({
  useVendor: () => ({ vendor, mutate: vi.fn() }),
  useVendorActions: () => ({ updateVendor: vi.fn() }),
}));

const documentsState = {
  documents: [] as unknown[],
  error: null,
  isLoading: false,
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  summarizeDocument: vi.fn(),
  getDownloadUrl: vi.fn(),
};
const reviewsState = {
  reviews: [] as unknown[],
  error: null,
  isLoading: false,
  signOffReview: vi.fn(),
};
vi.mock('@/hooks/use-vendor-tpsp', () => ({
  useVendorDocuments: () => documentsState,
  useVendorReviews: () => reviewsState,
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/hooks/use-task-items', () => ({
  useTaskItemActions: () => ({ createTaskItem: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  documentsState.documents = [];
  reviewsState.reviews = [];
});

describe('VendorTpspProfile', () => {
  it('shows PCI scope, readiness and the responsibility matrix', () => {
    render(<VendorTpspProfile vendorId="vnd_1" canUpdate />);
    expect(screen.getByText('PCI DSS scope')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText(/of 8 complete/)).toBeInTheDocument();
    expect(screen.getByText('3 Protect stored account data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit profile/ })).toBeInTheDocument();
  });

  it('hides edit actions for read-only users', () => {
    render(<VendorTpspProfile vendorId="vnd_1" canUpdate={false} />);
    expect(screen.queryByRole('button', { name: /Edit profile/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit matrix/ })).not.toBeInTheDocument();
  });
});

describe('VendorDocumentsTab', () => {
  it('guides an empty vendor and lets editors upload', () => {
    render(<VendorDocumentsTab vendorId="vnd_1" canUpdate />);
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload document/ })).toBeInTheDocument();
  });

  it('lists documents with expiry and hides mutations for read-only users', () => {
    documentsState.documents = [
      {
        id: 'vdoc_1',
        vendorId: 'vnd_1',
        type: 'soc2_type2',
        name: 'SOC 2 2025',
        periodStart: null,
        periodEnd: null,
        expiresAt: '2000-01-01T00:00:00.000Z',
        expiringSoon: true,
        aiSummary: null,
        aiSummaryStatus: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        attachment: { name: 'soc2.pdf', type: 'document', createdAt: '2026-01-01T00:00:00.000Z' },
      },
    ];
    render(<VendorDocumentsTab vendorId="vnd_1" canUpdate={false} />);
    expect(screen.getByText('SOC 2 2025')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload document/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Summarize/ })).not.toBeInTheDocument();
  });
});

describe('VendorReviewsTab', () => {
  it('shows status, cadence and sign-off for editors', () => {
    render(<VendorReviewsTab vendorId="vnd_1" canUpdate />);
    expect(screen.getByText('Not reviewed')).toBeInTheDocument();
    expect(screen.getByText(/6-month cadence/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign off review/ })).toBeInTheDocument();
  });

  it('renders history and hides sign-off for read-only users', () => {
    reviewsState.reviews = [
      {
        id: 'vrv_1',
        outcome: 'approved_with_conditions',
        notes: 'Map CUEC 4',
        checklist: {
          assuranceReviewed: true,
          pciStatusConfirmed: true,
          contractReviewed: false,
          riskReassessed: true,
        },
        criticality: 'critical',
        reviewedByName: 'Ada Lovelace',
        reviewedAt: '2026-05-01T00:00:00.000Z',
        nextReviewDue: '2026-11-01T00:00:00.000Z',
      },
    ];
    render(<VendorReviewsTab vendorId="vnd_1" canUpdate={false} />);
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Approved with conditions')).toBeInTheDocument();
    expect(screen.getByText('Map CUEC 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign off review/ })).not.toBeInTheDocument();
  });
});
