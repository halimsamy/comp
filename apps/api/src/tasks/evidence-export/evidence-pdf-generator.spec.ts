import {
  generateAutomationPDF,
  generateAutomationPDFFromStream,
  sanitizeFilename,
} from './evidence-pdf-generator';
import type { NormalizedAutomation } from './evidence-export.types';
import { pdfText } from './pdf-text.test-util';

describe('Evidence PDF Generator', () => {
  describe('sanitizeFilename', () => {
    it('should convert to lowercase and replace special characters', () => {
      expect(sanitizeFilename('Test Name')).toBe('test-name');
      expect(sanitizeFilename('MFA Enabled Check!')).toBe('mfa-enabled-check');
      expect(sanitizeFilename('Test@#$%^&*()Name')).toBe('test-name');
    });

    it('should trim leading and trailing dashes', () => {
      expect(sanitizeFilename('---Test---')).toBe('test');
      expect(sanitizeFilename('  Test  ')).toBe('test');
    });

    it('should truncate to 50 characters', () => {
      const longName =
        'This is a very long automation name that should be truncated to fifty characters';
      expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(50);
    });

    it('should handle empty strings with fallback', () => {
      expect(sanitizeFilename('')).toBe('export');
    });

    it('should handle non-ASCII only names with fallback', () => {
      expect(sanitizeFilename('日本語会社')).toBe('export');
      expect(sanitizeFilename('شركة عربية')).toBe('export');
    });
  });

  describe('generateAutomationPDF', () => {
    it('should generate a PDF buffer for an app automation', () => {
      const automation: NormalizedAutomation = {
        id: 'mfa-check',
        name: 'MFA Enabled Check',
        type: 'app_automation',
        integrationName: 'Google Workspace',
        checkId: 'mfa-check',
        runs: [
          {
            id: 'icr_123',
            type: 'app_automation',
            automationName: 'MFA Enabled Check',
            automationId: 'mfa-check',
            status: 'success',
            startedAt: new Date('2024-01-15T10:00:00Z'),
            completedAt: new Date('2024-01-15T10:00:05Z'),
            durationMs: 5000,
            totalChecked: 10,
            passedCount: 9,
            failedCount: 1,
            evaluationStatus: null,
            evaluationReason: null,
            logs: null,
            output: null,
            error: null,
            results: [
              {
                id: 'icx_1',
                passed: true,
                resourceType: 'user',
                resourceId: 'user@example.com',
                title: 'MFA Enabled',
                description: 'User has MFA enabled',
                severity: null,
                remediation: null,
                evidence: { mfaEnabled: true },
                collectedAt: new Date('2024-01-15T10:00:05Z'),
              },
            ],
            createdAt: new Date('2024-01-15T10:00:00Z'),
          },
        ],
        totalRuns: 1,
        successfulRuns: 1,
        failedRuns: 0,
        latestRunAt: new Date('2024-01-15T10:00:00Z'),
      };

      const context = {
        organizationName: 'Test Organization',
        taskTitle: 'Implement MFA',
      };

      const pdfBuffer = generateAutomationPDF(automation, context);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);

      // Check that it's a valid PDF by checking the header
      const header = pdfBuffer.slice(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');

      // House layout: cover, metadata, run table, results table, evidence JSON.
      const text = pdfText(pdfBuffer);
      expect(text).toContain('(Test Organization)');
      expect(text).toContain('(MFA Enabled Check)');
      expect(text).toContain('(Document ID)');
      expect(text).toContain('(Google Workspace)');
      expect(text).toContain('(1. Run history)');
      expect(text).toContain('(2. Run details)');
      expect(text).toContain('(SUCCESS)');
      expect(text).toContain('(PASS)');
      expect(text).toContain('(user/user@example.com)');
      expect(text).toContain('"mfaEnabled": true');
      expect(text).toContain('EVD-MFA-CHECK');
    });

    it('builds the same report from streamed run batches', async () => {
      const run = {
        id: 'ear_1',
        type: 'custom_automation' as const,
        automationName: 'Custom',
        automationId: 'ea_1',
        status: 'failed' as const,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        totalChecked: 0,
        passedCount: 0,
        failedCount: 0,
        evaluationStatus: 'fail' as const,
        evaluationReason: 'Missing evidence',
        logs: null,
        output: { apiKey: 'secret-value', count: 2 },
        error: 'Timeout',
        results: [],
        createdAt: new Date('2024-01-15T10:00:00Z'),
      };
      async function* batches() {
        yield [run];
        yield [{ ...run, id: 'ear_2', error: 'Second batch error' }];
      }
      const pdf = await generateAutomationPDFFromStream(
        {
          id: 'ea_1',
          name: 'Custom',
          type: 'custom_automation',
          runs: [],
          totalRuns: 2,
          successfulRuns: 0,
          failedRuns: 2,
          latestRunAt: run.createdAt,
        },
        {
          organizationName: 'Acme',
          taskTitle: 'Task',
          primaryColor: '#123456',
        },
        batches(),
      );
      const text = pdfText(pdf);
      expect(text).toContain('(Missing evidence)');
      expect(text).toContain('(Timeout)');
      expect(text).toContain('(Second batch error)');
      expect(text).toContain('"count": 2');
      expect(text).not.toContain('secret-value');
    });

    it('should generate a PDF buffer for a custom automation', () => {
      const automation: NormalizedAutomation = {
        id: 'ea_123',
        name: 'Custom Evidence Collection',
        type: 'custom_automation',
        runs: [
          {
            id: 'ear_123',
            type: 'custom_automation',
            automationName: 'Custom Evidence Collection',
            automationId: 'ea_123',
            status: 'success',
            startedAt: new Date('2024-01-15T10:00:00Z'),
            completedAt: new Date('2024-01-15T10:01:00Z'),
            durationMs: 60000,
            totalChecked: 1,
            passedCount: 1,
            failedCount: 0,
            evaluationStatus: 'pass',
            evaluationReason: 'All evidence collected successfully',
            logs: 'Execution completed',
            output: { data: 'test output' },
            error: null,
            results: [],
            createdAt: new Date('2024-01-15T10:00:00Z'),
          },
        ],
        totalRuns: 1,
        successfulRuns: 1,
        failedRuns: 0,
        latestRunAt: new Date('2024-01-15T10:00:00Z'),
      };

      const pdfBuffer = generateAutomationPDF(automation, {
        organizationName: 'Test Organization',
        taskTitle: 'Collect Evidence',
      });

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle automations with no runs', () => {
      const automation: NormalizedAutomation = {
        id: 'empty-check',
        name: 'Empty Check',
        type: 'app_automation',
        runs: [],
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        latestRunAt: null,
      };

      const pdfBuffer = generateAutomationPDF(automation, {
        organizationName: 'Test Organization',
        taskTitle: 'Test Task',
      });

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });
  });
});
