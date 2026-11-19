import type { Prisma } from '@db';
import {
  buildExportInput,
  draftVersionNumber,
  parseExportSnapshot,
  resolveInternalAuditExtras,
  resolveManagementReviewExtras,
} from './export-payload';
import type { LoadedExportDocument } from './export-payload';

// export-payload imports the db client at module load; a bare stub is enough
// since these pure helpers never touch it.
jest.mock('../../utils/compliance-filters', () => ({ filterComplianceMembers: jest.fn() }));
jest.mock('@db', () => ({ db: {} }));
// The 4.1 org-profile chain loads the auth package (ESM) through data-source;
// these tests never resolve an org profile.
jest.mock('../documents/org-profile', () => ({ loadOrgProfile: jest.fn() }));

const buildDocument = (
  over: Partial<LoadedExportDocument> = {},
): LoadedExportDocument =>
  ({ status: 'draft', currentVersion: null, ...over }) as unknown as LoadedExportDocument;

describe('draftVersionNumber', () => {
  it('returns 1 before anything has been published', () => {
    expect(draftVersionNumber(buildDocument({ currentVersion: null }))).toBe(1);
  });

  it('returns the published version when the approved draft is clean', () => {
    expect(
      draftVersionNumber(
        buildDocument({ status: 'approved', currentVersion: { version: 3 } }),
      ),
    ).toBe(3);
  });

  it('returns the next number while the draft is being edited', () => {
    expect(
      draftVersionNumber(
        buildDocument({ status: 'draft', currentVersion: { version: 3 } }),
      ),
    ).toBe(4);
  });
});

describe('parseExportSnapshot', () => {
  it('returns null for null / undefined', () => {
    expect(parseExportSnapshot(null)).toBeNull();
    expect(parseExportSnapshot(undefined)).toBeNull();
  });

  it('returns null for an array', () => {
    expect(parseExportSnapshot([1, 2] as never)).toBeNull();
  });

  it('returns null when required keys are missing', () => {
    expect(parseExportSnapshot({ type: 'x', input: {} })).toBeNull();
    expect(parseExportSnapshot({ input: {}, metadata: {} })).toBeNull();
  });

  it('returns the snapshot when type, input and metadata are present', () => {
    const snapshot = { type: 'x', input: { rows: [] }, metadata: { version: 1 } };
    expect(parseExportSnapshot(snapshot)).toBe(snapshot);
  });
});

describe('governing policy (9.2 / 9.3)', () => {
  const findFirst = jest.fn();
  const client = {
    member: { findMany: jest.fn().mockResolvedValue([]) },
    policy: { findFirst },
  } as unknown as Prisma.TransactionClient;
  const emptyRows = {
    contextIssues: [],
    interestedParties: [],
    interestedPartyRequirements: [],
    objectives: [],
    roles: [],
    metrics: [],
    audits: [],
    reviews: [],
  };

  beforeEach(() => findFirst.mockReset());

  it('resolves the linked policy org-scoped and puts it on the export input', async () => {
    findFirst.mockResolvedValue({
      name: 'Internal Audit Procedure',
      status: 'published',
      lastPublishedAt: new Date('2026-05-01T10:00:00Z'),
      currentVersion: { version: 3 },
    });
    const document = buildDocument({
      ...emptyRows,
      type: 'internal_audit',
      organizationId: 'org_1',
      draftNarrative: { programme: 'p', governingPolicyId: 'pol_1' },
    } as Partial<LoadedExportDocument>);

    const extras = await resolveInternalAuditExtras(document, client);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'pol_1', organizationId: 'org_1' }),
      }),
    );
    const input = buildExportInput({ document, internalAuditExtras: extras });
    expect(input.governingPolicy).toEqual({
      name: 'Internal Audit Procedure',
      status: 'published',
      version: 3,
      lastPublishedAt: '2026-05-01',
    });
  });

  it('leaves governingPolicy unset when nothing is linked or the policy is gone', async () => {
    const unlinked = buildDocument({
      ...emptyRows,
      type: 'management_review',
      organizationId: 'org_1',
      draftNarrative: { procedure: 'p' },
    } as Partial<LoadedExportDocument>);
    const extras = await resolveManagementReviewExtras(unlinked, client);
    expect(findFirst).not.toHaveBeenCalled();
    expect(
      buildExportInput({ document: unlinked, managementReviewExtras: extras })
        .governingPolicy,
    ).toBeUndefined();

    findFirst.mockResolvedValue(null);
    const archived = buildDocument({
      ...emptyRows,
      type: 'management_review',
      organizationId: 'org_1',
      draftNarrative: { procedure: 'p', governingPolicyId: 'pol_gone' },
    } as Partial<LoadedExportDocument>);
    const archivedExtras = await resolveManagementReviewExtras(archived, client);
    expect(archivedExtras?.governingPolicy).toBeUndefined();
  });
});
