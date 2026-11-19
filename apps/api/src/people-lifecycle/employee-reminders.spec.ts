const mockDb = {
  organization: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@trycompai/email', () => ({ isUserUnsubscribed: jest.fn().mockResolvedValue(false) }));
jest.mock('../email/trigger-email', () => ({ triggerEmail: jest.fn() }));
jest.mock('../email/templates/employee-security-tasks', () => ({ EmployeeSecurityTasksEmail: () => null }));
jest.mock('./org-compliance', () => ({ buildOrgCompliance: jest.fn() }));

import { triggerEmail } from '../email/trigger-email';
import { sendSecurityTaskReminders } from './employee-reminders';
import { buildOrgCompliance } from './org-compliance';
import { reminderDue } from './reminder-settings';

const entry = (id: string, items: { key: string; status: string }[], former = false) => ({
  member: { id, name: id, email: `${id}@acme.com`, former, deactivated: false },
  items: items.map((i) => ({ ...i, title: i.key, detail: null })),
  pendingPolicies: [{ id: 'pol_1', name: 'Acceptable use' }],
});

describe('security task reminders (#162)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.organization.findUnique.mockResolvedValue({ name: 'Acme' });
    (buildOrgCompliance as jest.Mock).mockResolvedValue([
      entry('mem_open', [{ key: 'policies', status: 'incomplete' }, { key: 'background_check', status: 'incomplete' }]),
      entry('mem_done', [{ key: 'policies', status: 'complete' }]),
      entry('mem_left', [{ key: 'training', status: 'expired' }], true),
    ]);
  });

  it('emails only current members with open portal tasks', async () => {
    const result = await sendSecurityTaskReminders({ organizationId: 'org_1' });
    expect(result).toEqual({ sent: 1, skipped: 2 });
    expect(triggerEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'mem_open@acme.com' }));
    // The scheduled run is not audit-logged.
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('audit-logs a manual "Send reminder" for the chosen members', async () => {
    await sendSecurityTaskReminders({
      organizationId: 'org_1',
      memberIds: ['mem_open'],
      actor: { userId: 'usr_admin', memberId: 'mem_admin' },
    });
    expect(mockDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1',
        userId: 'usr_admin',
        entityType: 'people',
        entityId: 'mem_open',
        data: expect.objectContaining({ action: 'personnel_reminder_sent', tasks: ['policies'] }),
      }),
    });
  });

  it('follows the Off / Weekly / Daily setting', () => {
    const now = new Date('2026-11-19T14:00:00Z');
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
    expect(reminderDue({ frequency: 'off', lastSentAt: null, now })).toBe(false);
    expect(reminderDue({ frequency: 'weekly', lastSentAt: daysAgo(3), now })).toBe(false);
    expect(reminderDue({ frequency: 'weekly', lastSentAt: daysAgo(7), now })).toBe(true);
    expect(reminderDue({ frequency: 'daily', lastSentAt: daysAgo(1), now })).toBe(true);
  });
});
