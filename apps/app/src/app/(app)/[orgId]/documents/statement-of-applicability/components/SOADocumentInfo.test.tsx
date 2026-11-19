import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SOADocumentInfo } from './SOADocumentInfo';

const document = {
  id: 'doc_1',
  version: 1,
  totalQuestions: 93,
  answeredQuestions: 90,
  status: 'in_progress',
  preparedBy: 'Halim',
};

const renderInfo = (undecidedCodes: string[], onFillRemaining = vi.fn()) =>
  render(
    <SOADocumentInfo
      document={document}
      isPendingApproval={false}
      canApprove
      isAutoFillingSSE={false}
      onAutoFill={vi.fn()}
      onFillRemaining={onFillRemaining}
      undecidedCodes={undecidedCodes}
      showUndecidedOnly={false}
      onToggleUndecidedOnly={vi.fn()}
      onSubmitForApproval={vi.fn()}
    />,
  );

describe('SOADocumentInfo', () => {
  it('blocks submit and lists the controls that are not decided', () => {
    const onFillRemaining = vi.fn();
    renderInfo(['A.5.1', 'A.7.4', 'A.8.2'], onFillRemaining);

    expect(screen.getByRole('button', { name: 'Submit for Approval' })).toBeDisabled();
    expect(screen.getByText(/Not decided: A\.5\.1, A\.7\.4, A\.8\.2\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fill remaining 3' }));
    expect(onFillRemaining).toHaveBeenCalled();
  });

  it('allows submit once every control is decided', () => {
    renderInfo([]);
    expect(screen.getByRole('button', { name: 'Submit for Approval' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Fill remaining/ })).not.toBeInTheDocument();
    expect(screen.getByText('Halim')).toBeInTheDocument();
  });
});
