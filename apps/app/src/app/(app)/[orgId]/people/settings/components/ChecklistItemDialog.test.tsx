import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChecklistItemCard } from './ChecklistItemCard';
import { ChecklistItemDialog } from './ChecklistItemDialog';
import type { TemplateItem } from './checklist-template';

const { patch, post } = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ api: { patch, post } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const item: TemplateItem = {
  id: 'oct_1',
  title: 'Sign NDA',
  description: null,
  evidenceRequired: true,
  sortOrder: 1,
  isDefault: false,
  isEnabled: true,
  dueDays: 7,
  appliesToRoles: ['contractor'],
  appliesToDepartments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  patch.mockResolvedValue({ data: {} });
});

describe('Checklist item targeting (#91)', () => {
  it('saves the roles and departments an item applies to', async () => {
    const onSaved = vi.fn();
    render(<ChecklistItemDialog open item={item} kind="onboarding" onOpenChange={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByText('IT'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        '/v1/offboarding-checklist/template/oct_1',
        expect.objectContaining({ appliesToRoles: ['contractor'], appliesToDepartments: ['it'], dueDays: 7 }),
      ),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows the audience, and edit only to organization:update', () => {
    const props = { item, dueFrom: 'start date', onToggleEnabled: vi.fn(), onToggleEvidence: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
    const { rerender } = render(<ChecklistItemCard {...props} canUpdate />);
    expect(screen.getByText('Only for contractor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Sign NDA' })).toBeInTheDocument();
    rerender(<ChecklistItemCard {...props} canUpdate={false} />);
    expect(screen.queryByRole('button', { name: 'Edit Sign NDA' })).not.toBeInTheDocument();
  });
});
