import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TrustFrameworkGrid } from './TrustFrameworkGrid';
import {
  TRUST_FRAMEWORKS,
  type TrustFrameworkKey,
  type TrustFrameworkValue,
} from './trust-frameworks';

const off = Object.fromEntries(
  TRUST_FRAMEWORKS.map((f) => [f.key, { enabled: false, status: 'started' }]),
) as Record<TrustFrameworkKey, TrustFrameworkValue>;

function setup({ canUpdate = true } = {}) {
  const onSave = vi.fn().mockResolvedValue({});
  render(
    <TrustFrameworkGrid
      orgId="org_1"
      values={off}
      liveStatus={{ pcidss: 'compliant', iso27001: 'in_progress' }}
      certificateFiles={{}}
      canUpdate={canUpdate}
      onSave={onSave}
      onFileUpload={vi.fn()}
      onFilePreview={vi.fn()}
    />,
  );
  return { onSave };
}

describe('TrustFrameworkGrid', () => {
  it("lists the org's frameworks first with a corrected PCI DSS description", () => {
    setup();
    const titles = screen
      .getAllByText(/^(ISO 27001|PCI DSS|ISO 42001|GDPR)$/)
      .map((el) => el.textContent);
    expect(titles.slice(0, 2)).toEqual(['ISO 27001', 'PCI DSS']);
    expect(screen.getByText(/protecting cardholder data/)).toBeInTheDocument();
  });

  it('saves the live status in one click and hides the hint once it matches', async () => {
    const { onSave } = setup();
    expect(screen.getByText('Live status: Compliant')).toBeInTheDocument();
    expect(screen.getByText('Live status: In progress')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Use live status' })[1]);
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ pcidss: true, pcidssStatus: 'compliant' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Live status: Compliant')).not.toBeInTheDocument(),
    );
  });

  it('shows the live status read-only without trust:update', () => {
    setup({ canUpdate: false });
    expect(screen.getByText('Live status: Compliant')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use live status' })).not.toBeInTheDocument();
  });
});
