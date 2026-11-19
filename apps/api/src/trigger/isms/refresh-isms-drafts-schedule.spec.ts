import { db } from '@db';
import { collectPlatformData } from '../../isms/documents/data-source';
import { runDerivation } from '../../isms/documents/generate';
import type { IsmsPlatformData } from '../../isms/documents/types';
import { refreshIsmsDraftsForAllOrgs } from './refresh-isms-drafts-schedule';

const tx = {
  $executeRaw: jest.fn(),
  ismsDocument: { findFirst: jest.fn(), update: jest.fn() },
  ismsContextIssue: {
    findMany: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock('@db', () => ({
  db: {
    ismsDocument: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
  },
}));
jest.mock('@trycompai/jobs', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  schedules: { task: (definition: unknown) => definition },
}));
jest.mock('../../isms/documents/data-source', () => ({
  collectPlatformData: jest.fn(),
}));
// The real 4.1 register upsert runs, without the narrative registry's imports.
jest.mock('../../isms/documents/generate', () => {
  const registers = jest.requireActual('../../isms/documents/generate-registers');
  return { runDerivation: jest.fn((args) => registers.generateContextIssues(args)) };
});

const platform = (overrides: Partial<IsmsPlatformData> = {}): IsmsPlatformData => ({
  organizationName: 'Spare',
  frameworkNames: ['ISO 27001'],
  vendorCount: 49,
  subProcessorCount: 0,
  vendorsByCategory: { other: 49 },
  subProcessorNames: [],
  infraVendorNames: [],
  memberCount: 21,
  membersByDepartment: { it: 21 },
  deviceCount: 0,
  riskCount: 0,
  highRiskCount: 0,
  hasTrainingProgram: false,
  wizardAnswers: {},
  partiesFingerprint: '',
  riskTreatmentFingerprint: '',
  ...overrides,
});

const contextDoc = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc_ctx',
  organizationId: 'org_a',
  frameworkId: 'fw_iso',
  type: 'context_of_organization',
  draftSnapshot: platform({ memberCount: 2, vendorCount: 9, membersByDepartment: { it: 2 } }),
  ...overrides,
});

const findMany = db.ismsDocument.findMany as jest.Mock;
const collect = collectPlatformData as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  collect.mockResolvedValue(platform());
  tx.ismsDocument.findFirst.mockResolvedValue({ id: 'doc_ctx' });
  tx.ismsContextIssue.findMany.mockResolvedValue([]);
});

describe('refreshIsmsDraftsForAllOrgs', () => {
  it('only loads draft and declined registers, never approved or pending ones', async () => {
    findMany.mockResolvedValue([]);
    await refreshIsmsDraftsForAllOrgs();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: {
            in: [
              'context_of_organization',
              'interested_parties_register',
              'interested_parties_requirements',
              'objectives_plan',
            ],
          },
          status: { in: ['draft', 'declined'] },
        },
      }),
    );
  });

  it('re-derives a drifted draft, keeping edited rows and refreshing the baseline', async () => {
    findMany.mockResolvedValue([contextDoc()]);
    tx.ismsContextIssue.findMany.mockResolvedValue([
      { id: 'row_members', source: 'derived', derivedFrom: 'members', position: 0 },
      { id: 'row_vendors', source: 'manual', derivedFrom: 'vendors', position: 1 },
    ]);

    const result = await refreshIsmsDraftsForAllOrgs();

    expect(result).toEqual({ documents: 1, refreshed: 1 });
    expect(tx.ismsContextIssue.update).toHaveBeenCalledWith({
      where: { id: 'row_members' },
      data: expect.objectContaining({ description: expect.stringContaining('21 members') }),
    });
    // The person-edited vendors row is not overwritten.
    expect(tx.ismsContextIssue.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'row_vendors' } }),
    );
    expect(tx.ismsDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc_ctx' },
      data: { draftSnapshot: expect.objectContaining({ memberCount: 21, vendorCount: 49 }) },
    });
  });

  it('skips documents without drift and documents never generated', async () => {
    findMany.mockResolvedValue([
      contextDoc({ draftSnapshot: platform() }),
      contextDoc({ id: 'doc_new', draftSnapshot: null }),
    ]);
    const result = await refreshIsmsDraftsForAllOrgs();
    expect(result.refreshed).toBe(0);
    expect(runDerivation).not.toHaveBeenCalled();
  });

  it('leaves a document alone once it was sent for approval after the read', async () => {
    findMany.mockResolvedValue([contextDoc()]);
    tx.ismsDocument.findFirst.mockResolvedValue(null);
    const result = await refreshIsmsDraftsForAllOrgs();
    expect(tx.ismsDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc_ctx', organizationId: 'org_a', status: { in: ['draft', 'declined'] } },
      select: { id: true },
    });
    expect(runDerivation).not.toHaveBeenCalled();
    expect(result.refreshed).toBe(0);
  });

  it('keeps going when one organization fails', async () => {
    findMany.mockResolvedValue([
      contextDoc({ organizationId: 'org_broken' }),
      contextDoc({ id: 'doc_b', organizationId: 'org_b' }),
    ]);
    collect.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(platform());
    const result = await refreshIsmsDraftsForAllOrgs();
    expect(result).toEqual({ documents: 2, refreshed: 1 });
    expect(collect).toHaveBeenCalledWith({ organizationId: 'org_b', frameworkId: 'fw_iso' });
  });
});
