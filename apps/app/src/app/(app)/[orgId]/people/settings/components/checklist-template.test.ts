import { describe, expect, it } from 'vitest';
import { audienceLabel } from './checklist-template';

describe('audienceLabel (#91)', () => {
  it('is empty for items that apply to everyone', () => {
    expect(audienceLabel({ appliesToRoles: [], appliesToDepartments: [] })).toBeNull();
    expect(audienceLabel({})).toBeNull();
  });

  it('lists the targeted roles and departments', () => {
    expect(audienceLabel({ appliesToRoles: ['contractor'], appliesToDepartments: ['it', 'hr'] })).toBe('contractor · IT, HR');
  });
});
