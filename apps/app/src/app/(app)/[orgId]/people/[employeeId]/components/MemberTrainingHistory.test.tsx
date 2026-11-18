import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberTrainingHistory } from './MemberTrainingHistory';

const { mockUseTraining, recordCompletion, downloadCertificate, hasPermission } = vi.hoisted(() => ({
  mockUseTraining: vi.fn(),
  hasPermission: vi.fn(),
  recordCompletion: vi.fn(),
  downloadCertificate: vi.fn(),
}));
vi.mock('@/hooks/use-member-training', () => ({ useMemberTraining: mockUseTraining }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const cycle = {
  moduleId: 'general',
  title: 'Security Awareness Training',
  completedAt: '2025-01-01T00:00:00Z',
  expiresAt: '2026-01-01T00:00:00Z',
  expired: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTraining.mockReturnValue({
    isLoading: false,
    cycles: [cycle],
    modules: [
      {
        id: 'trm_1',
        title: 'Secure coding',
        description: null,
        contentUrl: null,
        frameworkReference: 'PCI DSS 6.2.2',
        recurrenceMonths: 12,
        status: 'not_started',
        completedAt: null,
        expiresAt: null,
      },
    ],
    recordCompletion,
    downloadCertificate,
  });
});

describe('MemberTrainingHistory', () => {
  it('lets admins record role training and download a past cycle certificate', async () => {
    hasPermission.mockImplementation(
      (resource: string, action: string) => resource === 'training' && action === 'update',
    );
    render(<MemberTrainingHistory memberId="mem_1" />);

    expect(screen.getByText('PCI DSS 6.2.2')).toBeInTheDocument();
    expect(screen.getByText('Past cycle')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record completion' }));
    await waitFor(() => expect(recordCompletion).toHaveBeenCalledWith({ moduleId: 'trm_1' }));

    fireEvent.click(screen.getByRole('button', { name: /Certificate/ }));
    await waitFor(() => expect(downloadCertificate).toHaveBeenCalledWith(cycle));
  });

  it('hides recording without training:update', () => {
    hasPermission.mockReturnValue(false);
    render(<MemberTrainingHistory memberId="mem_1" />);
    expect(screen.queryByRole('button', { name: 'Record completion' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Certificate/ })).toBeInTheDocument();
  });
});
