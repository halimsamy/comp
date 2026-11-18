import { describe, expect, it } from 'vitest';

import {
  getTargetStatus,
  isTaskOverdue,
  type TaskAutomationData,
} from './task-schedule-helpers';

describe('task-schedule-helpers', () => {
  describe('getTargetStatus', () => {
    describe('No automations configured', () => {
      it('should return "todo" when no automations are configured', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [],
          integrationCheckRuns: [],
        };

        expect(getTargetStatus(task)).toBe('todo');
      });
    });

    describe('Custom Automations only', () => {
      it('should return "done" when all custom automations pass', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [
            { id: 'aut_1', runs: [{ evaluationStatus: 'pass' }] },
            { id: 'aut_2', runs: [{ evaluationStatus: 'pass' }] },
          ],
          integrationCheckRuns: [],
        };

        expect(getTargetStatus(task)).toBe('done');
      });

      it('should return "failed" when any custom automation fails', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [
            { id: 'aut_1', runs: [{ evaluationStatus: 'pass' }] },
            { id: 'aut_2', runs: [{ evaluationStatus: 'fail' }] },
          ],
          integrationCheckRuns: [],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should return "failed" when custom automation has no runs', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [{ id: 'aut_1', runs: [] }],
          integrationCheckRuns: [],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should return "failed" when custom automation has null evaluationStatus', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [{ id: 'aut_1', runs: [{ evaluationStatus: null }] }],
          integrationCheckRuns: [],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should only check the latest run for each custom automation', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [
            {
              id: 'aut_1',
              runs: [
                { evaluationStatus: 'pass' }, // Latest - pass
                { evaluationStatus: 'fail' }, // Older - fail (should be ignored)
              ],
            },
          ],
          integrationCheckRuns: [],
        };

        expect(getTargetStatus(task)).toBe('done');
      });
    });

    describe('App Automations only', () => {
      it('should return "done" when all app automations succeed', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'success', createdAt: new Date('2024-01-06') },
            { checkId: 'slack-channels', status: 'success', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('done');
      });

      it('should return "failed" when any app automation fails', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'success', createdAt: new Date('2024-01-06') },
            { checkId: 'slack-channels', status: 'failed', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should return "failed" when app automation is pending', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'pending', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should return "failed" when app automation is running', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'running', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should check latest run for each checkId separately', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [],
          integrationCheckRuns: [
            // Sorted by createdAt desc (latest first)
            {
              checkId: 'github-mfa',
              status: 'success',
              createdAt: new Date('2024-01-06T12:00:00'),
            },
            {
              checkId: 'slack-channels',
              status: 'failed',
              createdAt: new Date('2024-01-06T11:00:00'),
            },
            { checkId: 'github-mfa', status: 'failed', createdAt: new Date('2024-01-05T10:00:00') }, // Older, ignored
            {
              checkId: 'slack-channels',
              status: 'success',
              createdAt: new Date('2024-01-04T09:00:00'),
            }, // Older, ignored
          ],
        };

        // github-mfa: latest is success ✓
        // slack-channels: latest is failed ✗
        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should not depend on input ordering when selecting latest per checkId', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [],
          integrationCheckRuns: [
            // Unsorted on purpose
            {
              checkId: 'github-mfa',
              status: 'failed',
              createdAt: new Date('2024-01-05T10:00:00'),
            },
            {
              checkId: 'slack-channels',
              status: 'success',
              createdAt: new Date('2024-01-04T09:00:00'),
            },
            {
              checkId: 'slack-channels',
              status: 'failed',
              createdAt: new Date('2024-01-06T11:00:00'),
            }, // Latest for slack-channels
            {
              checkId: 'github-mfa',
              status: 'success',
              createdAt: new Date('2024-01-06T12:00:00'),
            }, // Latest for github-mfa
          ],
        };

        // github-mfa: latest is success ✓
        // slack-channels: latest is failed ✗
        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should return "done" when all check types have successful latest runs', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [],
          integrationCheckRuns: [
            // Sorted by createdAt desc (latest first)
            {
              checkId: 'github-mfa',
              status: 'success',
              createdAt: new Date('2024-01-06T12:00:00'),
            },
            {
              checkId: 'slack-channels',
              status: 'success',
              createdAt: new Date('2024-01-06T11:00:00'),
            },
            { checkId: 'github-mfa', status: 'failed', createdAt: new Date('2024-01-05T10:00:00') }, // Older, ignored
          ],
        };

        expect(getTargetStatus(task)).toBe('done');
      });
    });

    describe('Both Custom and App Automations', () => {
      it('should return "done" when both types pass', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [{ id: 'aut_1', runs: [{ evaluationStatus: 'pass' }] }],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'success', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('done');
      });

      it('should return "failed" when custom passes but app fails', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [{ id: 'aut_1', runs: [{ evaluationStatus: 'pass' }] }],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'failed', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should return "failed" when custom fails but app passes', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [{ id: 'aut_1', runs: [{ evaluationStatus: 'fail' }] }],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'success', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should return "failed" when both fail', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [{ id: 'aut_1', runs: [{ evaluationStatus: 'fail' }] }],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'failed', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('failed');
      });

      it('should check all custom and all app automations', () => {
        const task: TaskAutomationData = {
          evidenceAutomations: [
            { id: 'aut_1', runs: [{ evaluationStatus: 'pass' }] },
            { id: 'aut_2', runs: [{ evaluationStatus: 'pass' }] },
            { id: 'aut_3', runs: [{ evaluationStatus: 'pass' }] },
          ],
          integrationCheckRuns: [
            { checkId: 'github-mfa', status: 'success', createdAt: new Date('2024-01-06') },
            { checkId: 'slack-channels', status: 'success', createdAt: new Date('2024-01-06') },
            { checkId: 'jira-issues', status: 'success', createdAt: new Date('2024-01-06') },
          ],
        };

        expect(getTargetStatus(task)).toBe('done');
      });
    });
  });

  describe('getTargetStatus — MANUAL tasks', () => {
    it('returns "todo" for a MANUAL task even when all automations pass', () => {
      const task = {
        automationStatus: 'MANUAL' as const,
        evidenceAutomations: [],
        integrationCheckRuns: [
          { checkId: 'iam', status: 'success' as const, createdAt: new Date('2024-01-01') },
        ],
      };
      expect(getTargetStatus(task)).toBe('todo');
    });

    it('still returns "failed" for a MANUAL task with failing automations', () => {
      const task = {
        automationStatus: 'MANUAL' as const,
        evidenceAutomations: [],
        integrationCheckRuns: [
          { checkId: 'iam', status: 'failed' as const, createdAt: new Date('2024-01-01') },
        ],
      };
      expect(getTargetStatus(task)).toBe('failed');
    });
  });

  describe('isTaskOverdue', () => {
    const now = new Date('2024-06-15T12:00:00Z');

    it('is overdue once the due date (reviewDate) has passed', () => {
      expect(isTaskOverdue({ reviewDate: new Date('2024-06-15T11:59:59Z'), frequency: 'semiannually' }, now)).toBe(true);
      expect(isTaskOverdue({ reviewDate: now, frequency: 'yearly' }, now)).toBe(true);
    });

    it('is not overdue before the due date — no extra period is added', () => {
      expect(isTaskOverdue({ reviewDate: new Date('2024-06-16T00:00:00Z'), frequency: 'daily' }, now)).toBe(false);
    });

    it('is never overdue without a due date or frequency', () => {
      expect(isTaskOverdue({ reviewDate: null, frequency: 'monthly' }, now)).toBe(false);
      expect(isTaskOverdue({ reviewDate: new Date('2020-01-01'), frequency: null }, now)).toBe(false);
    });
  });
});
