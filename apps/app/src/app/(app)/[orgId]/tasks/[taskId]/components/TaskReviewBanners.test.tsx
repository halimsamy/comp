import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@trycompai/design-system', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
    AlertDialogContent: Pass,
    AlertDialogHeader: Pass,
    AlertDialogFooter: Pass,
    AlertDialogTitle: Pass,
    AlertDialogDescription: Pass,
    AlertDialogCancel: ({ children }: { children: ReactNode }) => <button>{children}</button>,
    AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
    Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
    HStack: Pass,
    Stack: Pass,
    Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  };
});
vi.mock('@trycompai/design-system/icons', () => ({
  CheckmarkOutline: () => null,
  Close: () => null,
  SubtractAlt: () => null,
  Time: () => null,
}));

import { evidenceSource } from './TaskEvidenceSourceBadge';
import { ApprovalBanner } from './TaskReviewBanners';

const approver = { user: { name: 'Dana', email: 'dana@example.com' } };
const base = { canApprove: false, approverMember: approver, onApprove: vi.fn(), onReject: vi.fn() };

describe('ApprovalBanner', () => {
  it('withdraws only after confirming, without rejecting (#44)', async () => {
    const onWithdraw = vi.fn().mockResolvedValue(undefined);
    render(<ApprovalBanner {...base} canWithdraw isAutoEvidence={false} onWithdraw={onWithdraw} />);

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw request' }));
    expect(onWithdraw).not.toHaveBeenCalled();
    expect(screen.getByText('Withdraw the review request?')).toBeInTheDocument();

    const confirm = screen.getAllByRole('button', { name: 'Withdraw request' }).at(-1);
    if (confirm) fireEvent.click(confirm);
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledTimes(1));
    expect(base.onReject).not.toHaveBeenCalled();
  });

  it('hides withdraw without task:update', () => {
    render(<ApprovalBanner {...base} canWithdraw={false} isAutoEvidence={false} onWithdraw={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Withdraw request' })).not.toBeInTheDocument();
  });

  it('says when Comp AI sent the evidence (#42)', () => {
    render(<ApprovalBanner {...base} canWithdraw={false} isAutoEvidence onWithdraw={vi.fn()} />);
    expect(screen.getByText('Auto-evidence pending approval')).toBeInTheDocument();
    expect(screen.getByText(/asked Dana to review it/)).toBeInTheDocument();
  });
});

describe('evidenceSource (#54)', () => {
  it('is Automated only with an active automation or integration', () => {
    expect(evidenceSource({ hasActiveAutomation: true, hasNativeRule: true })).toBe('automated');
    expect(evidenceSource({ hasActiveAutomation: false, hasNativeRule: true })).toBe('auto_evidence');
    expect(evidenceSource({ hasActiveAutomation: false, hasNativeRule: false })).toBeNull();
  });
});
