/**
 * Helper types and functions for task-schedule logic
 * Extracted for testability
 */

import type {
  EvidenceAutomationEvaluationStatus,
  IntegrationRunStatus,
  TaskAutomationStatus,
  TaskStatus,
} from '@db';

export type TargetStatus = Extract<TaskStatus, 'done' | 'todo' | 'failed'>;

export interface CustomAutomation {
  id: string;
  runs: Array<{
    evaluationStatus: EvidenceAutomationEvaluationStatus | null;
  }>;
}

export interface AppAutomationRun {
  checkId: string;
  status: IntegrationRunStatus;
  createdAt: Date;
}

export interface TaskAutomationData {
  evidenceAutomations: CustomAutomation[];
  integrationCheckRuns: AppAutomationRun[];
  /** MANUAL tasks have a part only a person can redo, so passing automations
   * never keep them done past their due date. */
  automationStatus?: TaskAutomationStatus;
}

/**
 * Determines the target status for a task based on its automation state.
 *
 * Logic:
 * - No automations configured → 'todo'
 * - All automations passing → 'done' (keep current status)
 * - Any automation failing → 'failed'
 *
 * Custom Automations (EvidenceAutomation):
 * - Must have isEnabled = true (already filtered in query)
 * - Latest run must have evaluationStatus = 'pass'
 *
 * App Automations (IntegrationCheckRun):
 * - Groups by checkId
 * - Latest run for each checkId must have status = 'success'
 */
export const getTargetStatus = (task: TaskAutomationData): TargetStatus => {
  // Custom Automations: isEnabled = true AND latest run evaluationStatus = 'pass'
  const hasCustomAutomations = task.evidenceAutomations.length > 0;
  const customAutomationsPassing =
    hasCustomAutomations &&
    task.evidenceAutomations.every((automation) => {
      const latestRun = automation.runs[0];
      return latestRun?.evaluationStatus === 'pass';
    });

  // App Automations: Group by checkId and check latest run for each check type
  const hasAppAutomations = task.integrationCheckRuns.length > 0;
  let appAutomationsPassing = false;

  if (hasAppAutomations) {
    // Group runs by checkId and get the latest for each (order-independent)
    const latestRunByCheckId = new Map<string, AppAutomationRun>();
    for (const run of task.integrationCheckRuns) {
      const existing = latestRunByCheckId.get(run.checkId);
      if (!existing || run.createdAt > existing.createdAt) {
        latestRunByCheckId.set(run.checkId, run);
      }
    }

    // All check types must have status = 'success'
    appAutomationsPassing = Array.from(latestRunByCheckId.values()).every(
      (run) => run.status === 'success',
    );
  }

  // If no automations configured at all → move to "todo"
  if (!hasCustomAutomations && !hasAppAutomations) {
    return 'todo';
  }

  // If automations are configured, check if all are passing
  const allPassing =
    (!hasCustomAutomations || customAutomationsPassing) &&
    (!hasAppAutomations || appAutomationsPassing);

  if (allPassing) {
    return task.automationStatus === 'MANUAL' ? 'todo' : 'done';
  }

  // Some automations are failing → move to "failed"
  return 'failed';
};

/**
 * `reviewDate` holds the task's next due date (set on completion from its
 * frequency), so a done task is overdue once that date has passed.
 */
export const isTaskOverdue = (
  task: { reviewDate: Date | null; frequency: string | null },
  now: Date,
): boolean => task.reviewDate !== null && task.frequency !== null && task.reviewDate <= now;
