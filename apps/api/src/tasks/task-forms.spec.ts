import { NotFoundException } from '@nestjs/common';

const mockDb = {
  task: { findFirst: jest.fn() },
  control: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
const mockDeadlines = jest.fn();
jest.mock('../evidence-forms/form-deadlines', () => ({ listFormDeadlines: (...a: unknown[]) => mockDeadlines(...a) }));

import { listTaskForms } from './task-forms';

const deadline = (formType: string) => ({
  formType,
  title: formType,
  status: 'never_submitted',
  lastSubmittedAt: null,
  nextDueAt: null,
});

describe('listTaskForms (#173)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the forms linked to the task’s controls, direct or framework-scoped', async () => {
    mockDb.task.findFirst.mockResolvedValue({ id: 'tsk_1' });
    mockDb.control.findMany.mockResolvedValue([
      { controlDocumentTypes: [{ formType: 'penetration_test' }], frameworkDocumentLinks: [{ formType: 'rbac_matrix' }] },
    ]);
    mockDeadlines.mockResolvedValue([deadline('penetration-test'), deadline('rbac-matrix'), deadline('meeting')]);

    const forms = await listTaskForms({ organizationId: 'org_1', taskId: 'tsk_1' });

    expect(mockDb.task.findFirst).toHaveBeenCalledWith({ where: { id: 'tsk_1', organizationId: 'org_1' }, select: { id: true } });
    expect(forms.map((f) => f.formType)).toEqual(['penetration-test', 'rbac-matrix']);
    expect(forms[1]).toMatchObject({ hasMatrix: true, retiredTo: { label: 'People > Access' } });
    expect(forms[0]).toMatchObject({ hasMatrix: false, retiredTo: null });
  });

  it('returns nothing without linked forms and 404s for another org’s task', async () => {
    mockDb.task.findFirst.mockResolvedValueOnce({ id: 'tsk_1' });
    mockDb.control.findMany.mockResolvedValue([]);
    expect(await listTaskForms({ organizationId: 'org_1', taskId: 'tsk_1' })).toEqual([]);
    expect(mockDeadlines).not.toHaveBeenCalled();

    mockDb.task.findFirst.mockResolvedValueOnce(null);
    await expect(listTaskForms({ organizationId: 'org_2', taskId: 'tsk_1' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
