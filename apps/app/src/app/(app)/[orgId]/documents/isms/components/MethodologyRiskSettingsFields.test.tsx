import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IsmsRiskMethodologyNarrative } from '../isms-types';
import { RiskMethodologyForm } from './RiskMethodologyForm';

const narrative: IsmsRiskMethodologyNarrative = {
  purpose: 'p',
  scope: 's',
  approach: 'a',
  likelihoodDescriptions: ['1', '2', '3', '4', '5'],
  impactDescriptions: ['1', '2', '3', '4', '5'],
  acceptanceThresholds: ['1', '2', '3', '4', '5'],
  treatmentOptions: ['1', '2', '3', '4'],
  responsibilities: 'r',
  frequency: 'f',
  documentation: 'd',
};

describe('Risk methodology settings', () => {
  it('shows the configured acceptance threshold and review interval read-only', () => {
    render(
      <RiskMethodologyForm
        narrative={{ ...narrative, acceptanceRequiredFromLevel: 'high', reviewIntervalMonths: 6 }}
        canEdit={false}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('High residual risk')).toBeInTheDocument();
    expect(screen.getByText('Every 6 months')).toBeInTheDocument();
  });

  it('saves the API defaults when the draft has no settings yet', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RiskMethodologyForm narrative={narrative} canEdit onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Purpose'), { target: { value: 'Updated purpose' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save methodology' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ acceptanceRequiredFromLevel: 'medium', reviewIntervalMonths: 3 }),
      ),
    );
  });
});
