import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecordRiskReviewSheet } from './RecordRiskReviewSheet';

const renderSheet = (onRecord = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <RecordRiskReviewSheet
      open
      members={[{ id: 'mem_1', user: { name: 'Jane Doe', email: 'j@x.com' } }]}
      onOpenChange={vi.fn()}
      onRecord={onRecord}
    />,
  );
  return onRecord;
};

describe('RecordRiskReviewSheet', () => {
  it('signs off a scheduled review with the caller as default reviewer', async () => {
    const onRecord = renderSheet();
    fireEvent.change(screen.getByLabelText('Findings and decisions'), {
      target: { value: 'Raised skimming risk after checkout launch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign off review' }));
    await waitFor(() =>
      expect(onRecord).toHaveBeenCalledWith({
        trigger: 'scheduled',
        reviewedById: '',
        notes: 'Raised skimming risk after checkout launch',
      }),
    );
  });

  it('requires a description for a significant-change review', async () => {
    const onRecord = renderSheet();
    fireEvent.click(screen.getByRole('radio', { name: 'Significant change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign off review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Describe the change');
    expect(onRecord).not.toHaveBeenCalled();
  });
});
