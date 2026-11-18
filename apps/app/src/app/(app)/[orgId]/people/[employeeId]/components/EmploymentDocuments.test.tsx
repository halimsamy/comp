import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmploymentDocuments } from './EmploymentDocuments';

const { mockUseEvidence, deleteEvidence } = vi.hoisted(() => ({
  mockUseEvidence: vi.fn(),
  deleteEvidence: vi.fn(),
}));
vi.mock('@/hooks/use-employment-evidence', () => ({ useEmploymentEvidence: mockUseEvidence }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseEvidence.mockReturnValue({
    isLoading: false,
    attachments: [{ id: 'att_1', name: 'nda.pdf', type: 'document', downloadUrl: '', createdAt: '2026-01-01' }],
    uploadEvidence: vi.fn(),
    deleteEvidence,
    getDownloadUrl: vi.fn(),
  });
});

describe('EmploymentDocuments', () => {
  it('lets editors upload and remove onboarding documents', async () => {
    render(<EmploymentDocuments memberId="mem_1" eventType="onboard" canEdit />);
    expect(screen.getByText('Onboarding documents')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove nda.pdf' }));
    await waitFor(() => expect(deleteEvidence).toHaveBeenCalledWith('att_1'));
    expect(mockUseEvidence).toHaveBeenCalledWith({ memberId: 'mem_1', eventType: 'onboard' });
  });

  it('is read-only without edit rights', () => {
    render(<EmploymentDocuments memberId="mem_1" eventType="offboard" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /Upload/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove nda.pdf' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download nda.pdf' })).toBeInTheDocument();
  });
});
