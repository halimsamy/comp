import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ismsDesignSystemMock, ismsIconsMock, ismsSharedMock } from './__test-helpers__/dsMocks';

const swrState: { data: unknown; error: unknown; isLoading: boolean } = {
  data: undefined,
  error: undefined,
  isLoading: false,
};

vi.mock('swr', () => ({ default: () => swrState }));
vi.mock('@/lib/api-client', () => ({ api: { get: vi.fn() } }));

// A native <select> stands in for the DS Select so tests can pick a value.
vi.mock('@trycompai/design-system', () => ({
  ...ismsDesignSystemMock(),
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <select
      aria-label="Governing policy"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));
vi.mock('@trycompai/design-system/icons', () => ismsIconsMock());
vi.mock('./shared', () => ismsSharedMock());

import { ProcedureCard } from './ProcedureCard';
import { ProgrammeCard } from './ProgrammeCard';

const POLICIES = [
  { id: 'pol_ia', name: 'Internal Audit Procedure', status: 'published' },
  { id: 'pol_mr', name: 'ISMS Monitoring, Management Review & Improvement', status: 'draft' },
];

describe('Governing policy link on 9.2 / 9.3', () => {
  beforeEach(() => {
    swrState.data = POLICIES;
    swrState.error = undefined;
  });

  it('links a policy, keeping the paragraph for an unlink', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProgrammeCard narrative={{ programme: 'Annual audit.' }} canEdit onSave={onSave} />);
    expect(screen.getByText('Annual audit.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Governing policy'), { target: { value: 'pol_ia' } });
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ programme: 'Annual audit.', governingPolicyId: 'pol_ia' }),
    );
  });

  it('shows the linked policy instead of the paragraph and unlinks back to it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ProgrammeCard
        narrative={{ programme: 'Annual audit.', governingPolicyId: 'pol_ia' }}
        canEdit
        onSave={onSave}
      />,
    );
    expect(screen.getByRole('link', { name: 'Internal Audit Procedure' })).toBeInTheDocument();
    expect(screen.queryByText('Annual audit.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit programme')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Governing policy'), { target: { value: 'none' } });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ programme: 'Annual audit.' }));
  });

  it('warns when the linked policy is not published', () => {
    render(
      <ProcedureCard
        narrative={{ procedure: 'Annual review.', governingPolicyId: 'pol_mr' }}
        canEdit
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/This policy is not published/)).toBeInTheDocument();
  });

  it('warns when the linked policy is archived or deleted', () => {
    render(
      <ProcedureCard
        narrative={{ procedure: 'Annual review.', governingPolicyId: 'pol_gone' }}
        canEdit
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/archived or deleted/)).toBeInTheDocument();
  });

  it('read-only users see the link but cannot change it', () => {
    render(
      <ProcedureCard
        narrative={{ procedure: 'Annual review.', governingPolicyId: 'pol_mr' }}
        canEdit={false}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Governing policy')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'ISMS Monitoring, Management Review & Improvement' }),
    ).toBeInTheDocument();
  });

  it('read-only users without a link see the paragraph', () => {
    render(<ProcedureCard narrative={{ procedure: 'Annual review.' }} canEdit={false} onSave={vi.fn()} />);
    expect(screen.queryByLabelText('Governing policy')).not.toBeInTheDocument();
    expect(screen.getByText('Annual review.')).toBeInTheDocument();
  });
});
