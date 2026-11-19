import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IsmsRiskMethodologyNarrative } from '../isms-types';
import { RiskMethodologyForm } from './RiskMethodologyForm';

const narrative: IsmsRiskMethodologyNarrative = {
  purpose: 'p',
  scope: 's',
  approach: 'a',
  likelihoodDescriptions: ['1', '2', '3', '4', '5'],
  impactDescriptions: ['1', '2', '3', '4', '5'],
  acceptanceThresholds: ['a1', 'a2', 'a3', 'a4', 'a5'],
  treatmentOptions: ['1', '2', '3', '4'],
  responsibilities: 'r',
  frequency: 'f',
  documentation: 'd',
};

describe('RiskMethodologyForm approval and escalation', () => {
  it.each([
    ['medium', 2],
    ['high', 3],
  ] as const)('derives the owner-acceptance rows from threshold %s', (level, required) => {
    render(
      <RiskMethodologyForm
        narrative={{ ...narrative, acceptanceRequiredFromLevel: level }}
        canEdit={false}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText('Approval and escalation')).toBeInTheDocument();
    expect(screen.getAllByText('Required: risk-owner acceptance recorded')).toHaveLength(
      5 - required,
    );
    expect(screen.getAllByText('Not required (accepted by default)')).toHaveLength(required);
    // The free text stays as the approval/escalation column.
    expect(screen.getByText('a4')).toBeInTheDocument();
  });

  it('keeps the computed column read-only for editors', () => {
    render(<RiskMethodologyForm narrative={narrative} canEdit onSave={vi.fn()} />);
    expect(
      screen.getByRole('textbox', { name: 'Approval and escalation: High' }),
    ).toHaveValue('a4');
    expect(screen.getAllByText('Required: risk-owner acceptance recorded')).toHaveLength(3);
  });
});
