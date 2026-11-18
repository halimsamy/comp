import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingModulesSettings } from './TrainingModulesSettings';
import { toTrainingModulePayload, trainingModuleSchema } from './trainingModuleSchema';

const { patch, hasPermission, mutate } = vi.hoisted(() => ({
  patch: vi.fn(),
  hasPermission: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ patch, post: vi.fn() }) }));
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission }) }));
vi.mock('@/hooks/use-api-swr', () => ({
  useApiSWR: () => ({
    mutate,
    data: {
      data: [
        {
          id: 'trm_1',
          title: 'Secure coding',
          description: null,
          frameworkReference: 'PCI DSS 6.2.2',
          targetRoles: ['employee'],
          targetDepartments: ['it'],
          recurrenceMonths: 12,
          isEnabled: true,
        },
      ],
    },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  patch.mockResolvedValue({ data: {} });
});

describe('TrainingModulesSettings', () => {
  it('lets training admins add and unassign modules', async () => {
    hasPermission.mockReturnValue(true);
    render(<TrainingModulesSettings />);

    expect(screen.getByText('employee · IT · renews every 12 months')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add training/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Assign Secure coding' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/training/modules/trm_1', { isEnabled: false }));
    expect(hasPermission).toHaveBeenCalledWith('training', 'update');
  });

  it('is read-only without training:update', () => {
    hasPermission.mockReturnValue(false);
    render(<TrainingModulesSettings />);
    expect(screen.queryByRole('button', { name: /Add training/ })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Assign Secure coding' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('trainingModuleSchema', () => {
  const base = {
    title: 'Secure coding',
    description: '',
    contentUrl: '',
    frameworkReference: '',
    targetRoles: [],
    targetDepartments: ['it'],
    recurrenceMonths: 12,
  };

  it('rejects bad URLs and recurrence', () => {
    expect(trainingModuleSchema.safeParse({ ...base, contentUrl: 'owasp.org' }).success).toBe(false);
    expect(trainingModuleSchema.safeParse({ ...base, recurrenceMonths: 0 }).success).toBe(false);
  });

  it('drops empty optional fields from the payload', () => {
    const parsed = trainingModuleSchema.parse(base);
    expect(toTrainingModulePayload(parsed)).toEqual({
      title: 'Secure coding',
      recurrenceMonths: 12,
      targetRoles: [],
      targetDepartments: ['it'],
    });
  });
});
