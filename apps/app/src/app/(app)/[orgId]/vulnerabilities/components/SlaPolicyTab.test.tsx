import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlaPolicyTab } from './SlaPolicyTab';

const { save, state } = vi.hoisted(() => {
  const save = vi.fn();
  // Stable like SWR data, so the reset-on-load effect runs once.
  const state = {
    policy: {
      criticalDays: 30,
      highDays: 30,
      mediumDays: 90,
      lowDays: 180,
      isDefault: true,
      updatedAt: null,
      policy: { id: 'pol_1', name: 'Vulnerability & Patch Management' },
    },
    isLoading: false,
    save,
  };
  return { save, state };
});
vi.mock('@/hooks/use-vulnerability-program', () => ({ useSlaPolicy: () => state }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'org_1' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('SlaPolicyTab', () => {
  it('links the patch policy and blocks a critical SLA over 30 days', async () => {
    render(<SlaPolicyTab canEdit />);
    expect(screen.getByRole('link', { name: 'Vulnerability & Patch Management' })).toHaveAttribute(
      'href',
      '/org_1/policies/pol_1',
    );
    fireEvent.change(screen.getByLabelText('Critical days'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save SLA policy' }));
    expect(await screen.findByText(/critical within 30 days/)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves valid days', async () => {
    render(<SlaPolicyTab canEdit />);
    fireEvent.change(screen.getByLabelText('Critical days'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save SLA policy' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        criticalDays: 14,
        highDays: 30,
        mediumDays: 90,
        lowDays: 180,
      }),
    );
  });

  it('is read-only without update permission', () => {
    render(<SlaPolicyTab canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Save SLA policy' })).not.toBeInTheDocument();
  });
});
