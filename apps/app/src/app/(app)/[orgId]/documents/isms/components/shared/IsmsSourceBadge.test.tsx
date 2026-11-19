import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ismsDesignSystemMock } from '../__test-helpers__/dsMocks';

vi.mock('@trycompai/design-system', () => ismsDesignSystemMock());

import { IsmsSourceBadge } from './IsmsSourceBadge';

describe('IsmsSourceBadge', () => {
  it('shows the party name for a party-derived row, never the raw record id', () => {
    render(<IsmsSourceBadge source="derived" derivedFrom="party:Employees / workforce" />);

    expect(screen.getByText('Employees / workforce')).toBeInTheDocument();
    // The raw "party:" provenance prefix must never leak into the label.
    expect(screen.queryByText(/^party:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Party /)).not.toBeInTheDocument();
  });

  it('falls back to "Interested party" when the party name is blank', () => {
    render(<IsmsSourceBadge source="derived" derivedFrom="party:" />);

    expect(screen.getByText('Interested party')).toBeInTheDocument();
  });

  it('labels generated rows "Generated" with the source in the tooltip', () => {
    render(<IsmsSourceBadge source="derived" derivedFrom="framework:ISO 27001" />);

    expect(screen.getByText('Generated')).toBeInTheDocument();
    expect(screen.getByTitle('Source: ISO 27001')).toBeInTheDocument();
  });

  it('never shows a raw seed key', () => {
    render(<IsmsSourceBadge source="derived" derivedFrom="seed:top_management" />);

    expect(screen.getByText('Generated')).toBeInTheDocument();
    expect(screen.queryByText(/seed/i)).not.toBeInTheDocument();
  });

  it('labels an edited generated row "Edited"', () => {
    render(<IsmsSourceBadge source="manual" derivedFrom="vendors" />);

    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.getByTitle('Source: Vendor register')).toBeInTheDocument();
  });

  it('labels manual rows "Manual"', () => {
    render(<IsmsSourceBadge source="manual" derivedFrom={null} />);

    expect(screen.getByText('Manual')).toBeInTheDocument();
  });
});
