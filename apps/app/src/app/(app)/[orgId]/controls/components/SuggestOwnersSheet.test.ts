import { describe, expect, it, vi } from 'vitest';
import { bulkResultMessage } from './ControlsBulkBar';
import { applySuggestions } from './SuggestOwnersSheet';

describe('applySuggestions', () => {
  it('makes one bulk call per suggested owner and adds up the results', async () => {
    const bulkSetOwner = vi.fn().mockResolvedValue({ controls: 1, tasks: 1, policies: 1 });
    const total = await applySuggestions({
      suggestions: [
        { controlId: 'c1', controlName: 'A', code: 'A.5.1', memberId: 'm_spo', memberName: 'S', roleName: 'SPO' },
        { controlId: 'c2', controlName: 'B', code: 'A.5.2', memberId: 'm_spo', memberName: 'S', roleName: 'SPO' },
        { controlId: 'c3', controlName: 'C', code: 'A.6.1', memberId: 'm_hr', memberName: 'H', roleName: 'HR' },
      ],
      assignLinkedWork: true,
      bulkSetOwner,
    });
    expect(bulkSetOwner).toHaveBeenCalledWith({ controlIds: ['c1', 'c2'], ownerId: 'm_spo', assignLinkedWork: true });
    expect(bulkSetOwner).toHaveBeenCalledWith({ controlIds: ['c3'], ownerId: 'm_hr', assignLinkedWork: true });
    expect(total).toEqual({ controls: 2, tasks: 2, policies: 2 });
  });
});

describe('bulkResultMessage', () => {
  it('mentions linked work only when some was assigned', () => {
    expect(bulkResultMessage({ controls: 3, tasks: 0, policies: 0 })).toBe('Updated 3 controls');
    expect(bulkResultMessage({ controls: 1, tasks: 2, policies: 1 })).toBe(
      'Updated 1 control, assigned 2 tasks and 1 policies',
    );
  });
});
