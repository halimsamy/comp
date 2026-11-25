jest.mock('@db', () => ({ db: {} }));
jest.mock('./evidence-data-loader', () => ({
  getAutomationHeaders: jest.fn(async () => ({ taskTitle: 'Scope', organizationName: 'Acme', automations: [] })),
  streamAutomationRuns: jest.fn(),
}));
jest.mock('./evidence-attachment-streamer', () => ({
  getTaskAttachments: jest.fn(async () => []),
  appendAttachmentToArchive: jest.fn(),
  createFilenameTracker: () => (name: string) => name,
}));
jest.mock('./evidence-pdf-generator', () => ({
  generateAutomationPDFFromStream: jest.fn(),
  generateTaskSummaryPDF: jest.fn(() => Buffer.from('SUMMARY')),
  sanitizeFilename: (n: string) => n,
}));
const mockRender = jest.fn();
jest.mock('./task-platform-evidence', () => ({
  renderTaskAutoEvidence: (...a: unknown[]) => mockRender(...a),
}));

import type { Archiver } from 'archiver';
import type { TaskAttachment } from './evidence-attachment-streamer';
import { appendTaskEvidence, loadTaskBundle } from './framework-evidence-tasks';

describe('framework export task bundle — Auto-evidence', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const snapshot = { name: 'auto-scope-evidence-2026-11-19.pdf', buffer: Buffer.from('PDF') };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRender.mockResolvedValue(snapshot);
  });

  it('adds a fresh snapshot when the export has no period', async () => {
    const bundle = await loadTaskBundle({ organizationId: 'org_1', taskId: 'tsk_1', now });
    expect(bundle.autoEvidence).toBe(snapshot);
  });

  it('adds it when the audit period includes today', async () => {
    const bundle = await loadTaskBundle({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      period: { from: new Date('2026-01-01'), to: new Date('2026-11-19T23:59:59.999Z') },
      now,
    });
    expect(bundle.autoEvidence).toBe(snapshot);
  });

  it('leaves it out of a past audit period', async () => {
    const bundle = await loadTaskBundle({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      period: { from: new Date('2025-01-01'), to: new Date('2025-12-31T23:59:59.999Z') },
      now,
    });
    expect(bundle.autoEvidence).toBeNull();
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('writes the snapshot into the task attachments folder', async () => {
    const append = jest.fn();
    await appendTaskEvidence({
      archive: { append } as unknown as Archiver,
      bundle: { title: 'Scope', summaryPdf: Buffer.from('S'), automationPdfs: [], attachments: [], autoEvidence: snapshot },
      folderPath: 'A.1/Tasks/Scope',
    });
    expect(append).toHaveBeenCalledWith(snapshot.buffer, {
      name: 'A.1/Tasks/Scope/attachments/auto-scope-evidence-2026-11-19.pdf',
    });
  });

  it('copies a task upload into every requirement folder the task maps to', async () => {
    const { appendAttachmentToArchive } = jest.requireMock('./evidence-attachment-streamer');
    const upload: TaskAttachment = { id: 'att_1', name: 'scan.png', url: 'org/scan.png', type: 'image', createdAt: now };
    const bundle = { title: 'Scope', summaryPdf: Buffer.from('S'), automationPdfs: [], attachments: [upload], autoEvidence: null };
    const archive = { append: jest.fn() } as unknown as Archiver;

    await appendTaskEvidence({ archive, bundle, folderPath: 'A.1/Tasks/Scope' });
    await appendTaskEvidence({ archive, bundle, folderPath: 'A.2/Tasks/Scope' });

    const folders = appendAttachmentToArchive.mock.calls.map(([p]: [{ folderPath: string }]) => p.folderPath);
    expect(folders).toEqual(['A.1/Tasks/Scope/attachments', 'A.2/Tasks/Scope/attachments']);
  });
});
