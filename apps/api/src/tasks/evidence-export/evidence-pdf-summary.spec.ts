import { generateTaskSummaryPDF } from './evidence-pdf-generator';
import type { TaskEvidenceSummary } from './evidence-export.types';
import { pdfText } from './pdf-text.test-util';
import { taskDetails } from './task-summary-details';

describe('generateTaskSummaryPDF', () => {
  it('should generate a summary PDF for a task with multiple automations', () => {
    const summary: TaskEvidenceSummary = {
      taskId: 'tsk_123',
      taskTitle: 'Implement Security Controls',
      organizationId: 'org_123',
      organizationName: 'Test Organization',
      automations: [
        {
          id: 'mfa-check',
          name: 'MFA Enabled Check',
          type: 'app_automation',
          integrationName: 'Google Workspace',
          runs: [],
          totalRuns: 5,
          successfulRuns: 4,
          failedRuns: 1,
          latestRunAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'ea_123',
          name: 'Custom Evidence Collection',
          type: 'custom_automation',
          runs: [],
          totalRuns: 3,
          successfulRuns: 3,
          failedRuns: 0,
          latestRunAt: new Date('2024-01-16T10:00:00Z'),
        },
      ],
      exportedAt: new Date('2024-01-17T10:00:00Z'),
    };

    const pdfBuffer = generateTaskSummaryPDF(summary);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);

    // Check that it's a valid PDF
    const header = pdfBuffer.slice(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');

    const text = pdfText(pdfBuffer);
    expect(text).toContain('(Implement Security Controls)');
    expect(text).toContain('(Document ID)');
    expect(text).toContain('(1. Automations)');
    expect(text).toContain('(Custom Evidence Collection)');
    expect(text).toContain('(Custom automations)');
  });

  it('states the task description, status, people, review frequency and dates', () => {
    const summary: TaskEvidenceSummary = {
      taskId: 'tsk_123',
      taskTitle: 'Access Review',
      organizationId: 'org_123',
      organizationName: 'Test Organization',
      automations: [],
      exportedAt: new Date('2026-11-25T10:00:00Z'),
      task: taskDetails({
        description: 'Review every account quarterly.',
        status: 'done',
        frequency: 'quarterly',
        assignee: { user: { name: 'Ada', email: 'ada@x.test' } },
        approver: { user: { name: null, email: 'cto@x.test' } },
        approvedAt: new Date('2026-11-20T00:00:00Z'),
        lastCompletedAt: new Date('2026-11-19T00:00:00Z'),
        reviewDate: new Date('2027-02-19T00:00:00Z'),
        updatedAt: new Date('2026-11-21T00:00:00Z'),
      }),
    };

    const text = pdfText(generateTaskSummaryPDF(summary));
    for (const expected of [
      '(Task description)',
      '(Review every account quarterly.)',
      '(Done)',
      '(Ada)',
      '(cto@x.test, approved 2026-11-20)',
      '(Quarterly)',
      '(2027-02-19)',
      '(2026-11-21)',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('should handle tasks with no automations', () => {
    const summary: TaskEvidenceSummary = {
      taskId: 'tsk_123',
      taskTitle: 'Empty Task',
      organizationId: 'org_123',
      organizationName: 'Test Organization',
      automations: [],
      exportedAt: new Date('2024-01-17T10:00:00Z'),
    };

    const pdfBuffer = generateTaskSummaryPDF(summary);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    expect(pdfText(pdfBuffer)).toContain('(No automations for this task.)');
  });
});
