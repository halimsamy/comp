const evaluateAll = jest.fn();
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  task: (definition: unknown) => definition,
}));
jest.mock('@/attachments/attachments.service', () => ({ AttachmentsService: class {} }));
jest.mock('@/uploads/uploads.service', () => ({ UploadsService: class {} }));
jest.mock('@/tasks/native-evidence/native-evidence.service', () => ({
  NativeEvidenceService: class {
    evaluateAll = evaluateAll;
  },
}));

import { EVALUATE_NATIVE_TASK_EVIDENCE, evaluateNativeTaskEvidence } from './evaluate-native-task-evidence';

describe('evaluateNativeTaskEvidence', () => {
  it('runs the scheduled pass under the id task-schedule triggers', async () => {
    evaluateAll.mockResolvedValue({ checked: 3, submitted: 1 });
    const definition = evaluateNativeTaskEvidence as unknown as { id: string; run: () => Promise<unknown> };
    expect(definition.id).toBe(EVALUATE_NATIVE_TASK_EVIDENCE);
    expect(EVALUATE_NATIVE_TASK_EVIDENCE).toBe('evaluate-native-task-evidence');
    await expect(definition.run()).resolves.toEqual({ checked: 3, submitted: 1 });
  });
});
