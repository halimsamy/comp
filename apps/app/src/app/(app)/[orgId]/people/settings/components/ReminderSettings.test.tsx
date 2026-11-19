import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderSettings } from './ReminderSettings';

const { hasPermission } = vi.hoisted(() => ({ hasPermission: vi.fn() }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('@/hooks/use-api-swr', () => ({
  useApiSWR: () => ({ data: { data: { frequency: 'daily' } }, mutate: vi.fn() }),
}));
vi.mock('@/lib/api-client', () => ({ api: { put: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('ReminderSettings (#162)', () => {
  it('shows the saved frequency to admins', () => {
    hasPermission.mockReturnValue(true);
    render(<ReminderSettings />);
    expect(screen.getByLabelText('Reminder frequency')).toHaveTextContent('Daily');
    expect(screen.getByLabelText('Reminder frequency')).not.toBeDisabled();
  });

  it('is read-only without member:update', () => {
    hasPermission.mockReturnValue(false);
    render(<ReminderSettings />);
    expect(screen.getByLabelText('Reminder frequency')).toBeDisabled();
  });
});
