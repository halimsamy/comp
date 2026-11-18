import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FrameworkScores } from '@/lib/control-compliance';
import { FrameworkProgress } from './FrameworkProgress';

const scores: FrameworkScores = {
  complianceScore: 64,
  controlsComplete: 20,
  controlsTotal: 34,
  controlsNotApplicable: 2,
  requirementsSatisfied: 150,
  requirementsTotal: 270,
  requirementsNotApplicable: 10,
  counts: {
    policies: { total: 31, completed: 10 },
    tasks: { total: 68, completed: 40 },
    documents: { total: 8, completed: 3 },
    ismsDocuments: { total: 12, completed: 4 },
  },
  controls: {},
  requirements: {},
  computedAt: '2026-11-18T00:00:00.000Z',
};

describe('FrameworkProgress', () => {
  it('renders the API score with N/M controls and excluded requirements', () => {
    render(<FrameworkProgress scores={scores} />);
    expect(screen.getByText('64%')).toBeInTheDocument();
    expect(screen.getByText('20/34 controls complete')).toBeInTheDocument();
    expect(screen.getByText('150/270')).toBeInTheDocument();
    expect(screen.getByText('10 not applicable, excluded')).toBeInTheDocument();
    expect(screen.getByText('7/20')).toBeInTheDocument();
    expect(screen.getByText('4/12 ISMS documents published')).toBeInTheDocument();
  });

  it('renders nothing while scores are missing', () => {
    const { container } = render(<FrameworkProgress scores={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
