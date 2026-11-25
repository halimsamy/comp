const mockDb = { task: { findFirst: jest.fn() } };
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@trycompai/company', () => ({ toDbEvidenceFormType: (t: string) => `db_${t}` }));

const mockRule = { evaluate: jest.fn() };
jest.mock('../native-evidence/native-evidence-rules', () => ({
  ruleForTemplate: (id: string | null) => (id === 'frk_tt_rule' ? mockRule : null),
}));
jest.mock('../native-evidence/native-evidence-pdf', () => ({
  renderNativeEvidencePdf: jest.fn(() => ({ buffer: Buffer.from('PDF'), filename: 'scope-evidence-2026-11-19.pdf' })),
}));
const mockListTaskForms = jest.fn();
jest.mock('../task-forms', () => ({ listTaskForms: (...a: unknown[]) => mockListTaskForms(...a) }));
jest.mock('./evidence-pdf-generator', () => ({
  sanitizeFilename: (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
}));
const mockLoadBundle = jest.fn();
const mockAppendDocs = jest.fn();
jest.mock('./framework-evidence-documents', () => ({
  loadDocumentBundle: (...a: unknown[]) => mockLoadBundle(...a),
  appendDocumentEvidence: (...a: unknown[]) => mockAppendDocs(...a),
}));

import type { Archiver } from 'archiver';
import { createFilenameTracker } from './evidence-attachment-streamer';
import { appendTaskPlatformEvidence, renderTaskAutoEvidence } from './task-platform-evidence';

describe('appendTaskPlatformEvidence', () => {
  const append = jest.fn();
  const archive = { append } as unknown as Archiver;
  const run = () =>
    appendTaskPlatformEvidence({
      archive,
      organizationId: 'org_1',
      taskId: 'tsk_1',
      folderPath: 'root/01-attachments',
      uniqueName: createFilenameTracker(),
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.task.findFirst.mockResolvedValue({
      title: 'Scope',
      taskTemplateId: 'frk_tt_rule',
      frequency: 'yearly',
      organization: { name: 'Acme', primaryColor: null },
    });
    mockRule.evaluate.mockResolvedValue({ holds: true });
    mockListTaskForms.mockResolvedValue([]);
  });

  it('adds a fresh Auto-evidence snapshot to the attachments folder', async () => {
    await run();
    expect(mockDb.task.findFirst.mock.calls[0][0].where).toEqual({ id: 'tsk_1', organizationId: 'org_1' });
    expect(append).toHaveBeenCalledWith(expect.any(Buffer), {
      name: 'root/01-attachments/auto-scope-evidence-2026-11-19.pdf',
    });
  });

  it('skips the snapshot when the task has no Auto-evidence rule', async () => {
    mockDb.task.findFirst.mockResolvedValue({
      title: 'Other',
      taskTemplateId: 'frk_tt_none',
      frequency: null,
      organization: { name: 'Acme', primaryColor: null },
    });
    await run();
    expect(mockRule.evaluate).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('adds each Structured evidence form with submissions in its own sub-folder', async () => {
    mockListTaskForms.mockResolvedValue([
      { formType: 'penetration-test', retiredTo: null },
      { formType: 'empty-form', retiredTo: null },
    ]);
    mockLoadBundle.mockImplementation(async ({ formType }: { formType: string }) =>
      formType === 'db_penetration-test'
        ? { title: 'Penetration Test', csv: 'a,b', files: [] }
        : { title: 'Empty', csv: null, files: [] },
    );
    await run();
    expect(mockLoadBundle).toHaveBeenCalledWith({ organizationId: 'org_1', formType: 'db_penetration-test' });
    expect(mockAppendDocs).toHaveBeenCalledTimes(1);
    expect(mockAppendDocs.mock.calls[0][0].folderPath).toBe('root/01-attachments/penetration-test');
  });

  it('never exports a retired form, even with a pending submission', async () => {
    mockListTaskForms.mockResolvedValue([{ formType: 'network-diagram', retiredTo: { label: 'Assets', path: '/assets' } }]);
    mockLoadBundle.mockResolvedValue({ title: 'Network Diagram', csv: 'a,b', files: [] });
    await run();
    expect(mockLoadBundle).not.toHaveBeenCalled();
    expect(mockAppendDocs).not.toHaveBeenCalled();
  });

  it('renders no snapshot for a task outside the organization', async () => {
    mockDb.task.findFirst.mockResolvedValue(null);
    await expect(renderTaskAutoEvidence({ organizationId: 'org_2', taskId: 'tsk_1' })).resolves.toBeNull();
    expect(mockRule.evaluate).not.toHaveBeenCalled();
  });
});
