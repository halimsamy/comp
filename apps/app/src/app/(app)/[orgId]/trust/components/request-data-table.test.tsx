import type { AccessRequest } from '@/hooks/use-access-requests';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RequestDataTable } from './request-data-table';

const longPurpose =
  'We are evaluating your SOC 2 and PCI DSS posture for a payments partnership and need the full report.';

const request: AccessRequest = {
  id: 'req_1',
  name: 'Jane Buyer',
  email: 'jane@acme.co',
  purpose: longPurpose,
  requestedDurationDays: 30,
  status: 'under_review',
  createdAt: '2026-11-01T10:00:00.000Z',
};

function setup() {
  const handlers = {
    onApprove: vi.fn(),
    onDeny: vi.fn(),
    onResendNda: vi.fn(),
    onPreviewNda: vi.fn(),
  };
  render(<RequestDataTable data={[request]} {...handlers} />);
  return handlers;
}

describe('RequestDataTable', () => {
  it('truncates the purpose instead of widening the table', () => {
    setup();
    const cell = screen.getByText(longPurpose);
    expect(cell.className).toContain('truncate');
    expect(cell.className).toContain('max-w-[160px]');
  });

  it('collects row actions in one menu', async () => {
    const handlers = setup();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Jane Buyer' }));
    fireEvent.click(await screen.findByText('Approve'));
    expect(handlers.onApprove).toHaveBeenCalledWith(request);
  });
});
