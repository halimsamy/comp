import { db } from '@db';
import { buildDocumentControlRows, getRevisionHistory } from './policy-document-control.service';

jest.mock('@db', () => ({ db: {} }));
jest.mock('../../app/s3', () => ({
  s3Client: null,
  APP_AWS_ORG_ASSETS_BUCKET: undefined,
}));

const person = (name: string) => ({ user: { name, email: `${name}@acme.test` } });

describe('buildDocumentControlRows', () => {
  it('prints owner, version, approver and lifecycle dates', () => {
    const rows = buildDocumentControlRows({
      status: 'published',
      lastPublishedAt: new Date('2026-03-01T00:00:00Z'),
      reviewDate: new Date('2027-03-01T00:00:00Z'),
      frequency: 'yearly',
      visibility: 'ALL',
      visibleToDepartments: [],
      assignee: person('Olivia'),
      currentVersion: {
        version: 4,
        approvedAt: new Date('2026-02-28T00:00:00Z'),
        approvedBy: person('Adam'),
        publishedBy: person('Paul'),
      },
      reviews: [{ reviewedAt: new Date('2026-09-01T00:00:00Z') }],
    });

    expect(Object.fromEntries(rows.map((r) => [r.label, r.value]))).toEqual({
      'Policy owner': 'Olivia',
      Version: 'v4',
      'Approved by': 'Adam',
      'Approval date': 'February 28, 2026',
      'Effective date': 'March 1, 2026',
      'Last reviewed': 'September 1, 2026',
      'Next review': 'March 1, 2027',
      'Review frequency': 'Yearly',
      Classification: 'Internal - all employees',
    });
  });

  it('falls back gracefully for unpublished policies', () => {
    const rows = buildDocumentControlRows({
      status: 'draft',
      lastPublishedAt: null,
      reviewDate: null,
      frequency: null,
      visibility: 'DEPARTMENT',
      visibleToDepartments: ['it', 'hr'],
      assignee: null,
      currentVersion: null,
      reviews: [],
    });
    expect(rows.find((r) => r.label === 'Version')?.value).toBe('Draft');
    expect(rows.find((r) => r.label === 'Approved by')?.value).toBe('—');
    expect(rows.find((r) => r.label === 'Review frequency')?.value).toBe('Not set');
    expect(rows.find((r) => r.label === 'Classification')?.value).toBe('Internal - IT, HR');
  });
});

describe('getRevisionHistory', () => {
  it('only counts published versions up to the live version, so rejected drafts are not listed', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    Object.assign(db, {
      policy: { findUnique: jest.fn().mockResolvedValue({ currentVersion: { version: 2 } }) },
      policyVersion: { findMany },
    });

    await getRevisionHistory('pol_1');

    expect(findMany.mock.calls[0][0].where).toEqual({
      policyId: 'pol_1',
      OR: [{ approvedAt: { not: null } }, { publishedById: { not: null }, version: { lte: 2 } }],
    });
  });
});
