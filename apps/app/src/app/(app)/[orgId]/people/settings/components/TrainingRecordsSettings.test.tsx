import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingRecordsSettings } from './TrainingRecordsSettings';

const { hasPermission } = vi.hoisted(() => ({ hasPermission: vi.fn() }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('@/lib/api-client', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('TrainingRecordsSettings (#94)', () => {
  it('offers import and export with training:update', () => {
    hasPermission.mockReturnValue(true);
    render(<TrainingRecordsSettings />);
    expect(screen.getByRole('button', { name: /Import CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
  });

  it('only exports for training readers', () => {
    hasPermission.mockImplementation((_resource: string, action: string) => action === 'read');
    render(<TrainingRecordsSettings />);
    expect(screen.queryByRole('button', { name: /Import CSV/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument();
  });
});
