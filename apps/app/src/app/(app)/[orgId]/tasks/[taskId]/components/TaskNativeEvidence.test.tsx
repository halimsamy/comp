import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PERMISSIONS,
  AUDITOR_PERMISSIONS,
  mockHasPermission,
  setMockPermissions,
} from '@/test-utils/mocks/permissions';

vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'org_1', taskId: 'tsk_1' }) }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, hasPermission: mockHasPermission }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const mockHook = vi.fn();
vi.mock('../hooks/use-task-native-evidence', () => ({
  useTaskNativeEvidence: (...args: unknown[]) => mockHook(...args),
}));

import { TaskNativeEvidence } from './TaskNativeEvidence';

const evidence = {
  ruleKey: 'people_org_chart',
  module: 'People',
  title: 'An org chart snapshot was saved in the last 12 months',
  reference: 'ISO/IEC 27001:2022 5.3, A.5.2',
  path: '/people?tab=chart',
  holds: true,
  summary: '“Q4” saved 2026-11-01',
  issues: [],
  evaluatedAt: '2026-11-18T00:00:00.000Z',
  lastSubmittedAt: null,
  attachmentId: null,
  canSubmit: true,
};

const hookState = (overrides: Record<string, unknown> = {}) => ({
  evidence,
  isLoading: false,
  error: undefined,
  isSubmitting: false,
  refresh: vi.fn(),
  submit: vi.fn().mockResolvedValue({ outcome: 'submitted' }),
  ...overrides,
});

describe('TaskNativeEvidence', () => {
  beforeEach(() => {
    mockHook.mockReset();
    setMockPermissions(ADMIN_PERMISSIONS);
  });

  it('renders nothing for tasks without a native rule', () => {
    mockHook.mockReturnValue(hookState({ evidence: null }));
    const { container } = render(<TaskNativeEvidence taskId="tsk_1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the module, live status and a link to the source records', () => {
    mockHook.mockReturnValue(hookState());
    render(<TaskNativeEvidence taskId="tsk_1" />);
    expect(screen.getByText('Auto-evidence from People')).toBeInTheDocument();
    expect(screen.getByText('Rule met')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open People/ })).toHaveAttribute(
      'href',
      '/org_1/people?tab=chart',
    );
  });

  it('lists what is missing when the rule is not met, without a submit button', () => {
    mockHook.mockReturnValue(
      hookState({
        evidence: { ...evidence, holds: false, canSubmit: false, issues: ['Training outstanding: B'] },
      }),
    );
    render(<TaskNativeEvidence taskId="tsk_1" />);
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Training outstanding: B')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send for review/ })).not.toBeInTheDocument();
  });

  it('lets editors attach the snapshot and refreshes the task', async () => {
    const state = hookState();
    mockHook.mockReturnValue(state);
    const onTaskUpdated = vi.fn();
    render(<TaskNativeEvidence taskId="tsk_1" onTaskUpdated={onTaskUpdated} />);
    fireEvent.click(screen.getByRole('button', { name: /send for review/ }));
    await waitFor(() => expect(onTaskUpdated).toHaveBeenCalled());
    expect(state.submit).toHaveBeenCalled();
  });

  it('hides the submit button from read-only users', () => {
    setMockPermissions(AUDITOR_PERMISSIONS);
    mockHook.mockReturnValue(hookState());
    render(<TaskNativeEvidence taskId="tsk_1" />);
    expect(screen.queryByRole('button', { name: /send for review/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open People/ })).toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    mockHook.mockReturnValue(hookState({ isLoading: true, evidence: null }));
    const { rerender } = render(<TaskNativeEvidence taskId="tsk_1" />);
    expect(screen.getByText('Checking platform records…')).toBeInTheDocument();
    mockHook.mockReturnValue(hookState({ error: new Error('x'), evidence: null }));
    rerender(<TaskNativeEvidence taskId="tsk_1" />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
