import { logger, task } from '@trycompai/jobs';
import { AttachmentsService } from '@/attachments/attachments.service';
import { NativeEvidenceService } from '@/tasks/native-evidence/native-evidence.service';
import { UploadsService } from '@/uploads/uploads.service';
import { NovuService } from '@/notifications/novu.service';
import { TaskNotifierService } from '@/tasks/task-notifier.service';

export const EVALUATE_NATIVE_TASK_EVIDENCE = 'evaluate-native-task-evidence';

/**
 * Derives task evidence from native module state (ISMS, People, Access
 * reviews, Vendors). Triggered by the app's `task-schedule` job after it
 * reopens overdue tasks, so a reopened task is re-checked in the same pass.
 */
export const evaluateNativeTaskEvidence = task({
  id: EVALUATE_NATIVE_TASK_EVIDENCE,
  maxDuration: 30 * 60,
  run: async () => {
    // The job runs outside Nest's DI container, so wire the service by hand.
    const service = new NativeEvidenceService(
      new AttachmentsService(new UploadsService()),
      new TaskNotifierService(new NovuService()),
    );
    const result = await service.evaluateAll();
    logger.info('Evaluated native task evidence', result);
    return result;
  },
});
