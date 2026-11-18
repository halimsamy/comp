import { mockHasPermission, setMockPermissions } from '@/test-utils/mocks/permissions';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentValidity, isValidityExpired } from './AttachmentValidity';

const patch = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { patch: (...args: unknown[]) => patch(...args) } }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const current = { id: 'att_1', createdAt: '2026-01-01T00:00:00Z', validFrom: '2026-01-01T00:00:00Z', validUntil: '2099-04-01T00:00:00Z' };
const expired = { ...current, validUntil: '2026-04-01T00:00:00Z' };

beforeEach(() => {
  patch.mockReset();
  setMockPermissions({ evidence: ['read', 'update'] });
});

describe('AttachmentValidity', () => {
  it('flags expired evidence as needing an update', () => {
    expect(isValidityExpired(expired, new Date('2026-06-01'))).toBe(true);
    expect(isValidityExpired({ ...current, validUntil: null })).toBe(false);
    render(<AttachmentValidity attachment={expired} onChanged={vi.fn()} />);
    expect(screen.getByText('Needs update')).toBeInTheDocument();
  });

  it('shows the end date of current evidence', () => {
    render(<AttachmentValidity attachment={current} onChanged={vi.fn()} />);
    expect(screen.getByText('Valid until Apr 1, 2099')).toBeInTheDocument();
  });

  it('is read only without evidence:update and hidden when undated', () => {
    setMockPermissions({ evidence: ['read'] });
    const { container } = render(
      <AttachmentValidity attachment={{ ...current, validUntil: null }} onChanged={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    render(<AttachmentValidity attachment={expired} onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Change evidence validity/ })).not.toBeInTheDocument();
  });

  it('saves new dates', async () => {
    patch.mockResolvedValue({ data: {} });
    const onChanged = vi.fn();
    render(<AttachmentValidity attachment={expired} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /Change evidence validity/ }));
    fireEvent.change(screen.getByLabelText('Valid until (optional)'), { target: { value: '2027-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/attachments/att_1/validity', {
        validFrom: '2026-01-01',
        validUntil: '2027-01-01',
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });
});
