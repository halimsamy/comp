import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdate = vi.fn();
vi.mock('@/hooks/use-organization-mutations', () => ({
  useOrganizationMutations: () => ({ updateOrganization: mockUpdate }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { UpdateOrganizationCompanyDetails } from './update-organization-company-details';

const empty = { legalName: null, registeredAddress: null, phone: null };

describe('UpdateOrganizationCompanyDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
  });

  it('saves the legal name, address and phone', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<UpdateOrganizationCompanyDetails initialValues={empty} />);
    fireEvent.change(screen.getByLabelText('Legal name'), {
      target: { value: 'Spare Payments Ltd' },
    });
    fireEvent.change(screen.getByLabelText('Registered address'), {
      target: { value: '1 Main St, London' },
    });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+44 20 7946 0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        legalName: 'Spare Payments Ltd',
        registeredAddress: '1 Main St, London',
        phone: '+44 20 7946 0000',
      }),
    );
  });

  it('rejects a phone number that is not one', async () => {
    setMockPermissions(ADMIN_PERMISSIONS);
    render(<UpdateOrganizationCompanyDetails initialValues={empty} />);
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'call us' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Enter a phone number/)).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('is read-only without organization:update', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    render(
      <UpdateOrganizationCompanyDetails
        initialValues={{ legalName: 'Spare Payments Ltd', registeredAddress: null, phone: null }}
      />,
    );
    expect(screen.getByLabelText('Legal name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
