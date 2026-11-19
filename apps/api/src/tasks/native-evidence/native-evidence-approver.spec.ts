const mockDb = { member: { findFirst: jest.fn() }, control: { findFirst: jest.fn() } };
const mockHolders = jest.fn();
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../../controls/controls-owner-suggestions', () => ({ loadRoleHolders: (...a: unknown[]) => mockHolders(...a) }));

import { pickNativeApprover } from './native-evidence-approver';

const args = { organizationId: 'org_1', taskId: 'tsk_1', lastApproverId: 'mem_last' as string | null };

beforeEach(() => jest.clearAllMocks());

describe('pickNativeApprover (#42)', () => {
  it('prefers the task’s last approver while they are active in the org', async () => {
    mockDb.member.findFirst.mockResolvedValue({ id: 'mem_last' });
    expect(await pickNativeApprover(args)).toBe('mem_last');
    expect(mockDb.member.findFirst.mock.calls[0][0].where).toEqual({ id: 'mem_last', organizationId: 'org_1', deactivated: false });
    expect(mockDb.control.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to a mapped control owner, then the SPO', async () => {
    mockDb.member.findFirst.mockResolvedValue(null);
    mockDb.control.findFirst.mockResolvedValue({ ownerId: 'mem_owner' });
    expect(await pickNativeApprover(args)).toBe('mem_owner');
    expect(mockDb.control.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: 'org_1', tasks: { some: { id: 'tsk_1' } } });

    mockDb.control.findFirst.mockResolvedValue(null);
    mockHolders.mockResolvedValue([
      { roleKey: 'top_management', memberId: 'mem_ceo' },
      { roleKey: 'spo', memberId: 'mem_spo' },
    ]);
    expect(await pickNativeApprover({ ...args, lastApproverId: null })).toBe('mem_spo');
    mockHolders.mockResolvedValue([]);
    expect(await pickNativeApprover({ ...args, lastApproverId: null })).toBeNull();
  });
});
