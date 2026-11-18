import { buildDocumentControlRows } from './policy-document-control.service';

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
    });
  });

  it('falls back gracefully for unpublished policies', () => {
    const rows = buildDocumentControlRows({
      status: 'draft',
      lastPublishedAt: null,
      reviewDate: null,
      assignee: null,
      currentVersion: null,
      reviews: [],
    });
    expect(rows.find((r) => r.label === 'Version')?.value).toBe('Draft');
    expect(rows.find((r) => r.label === 'Approved by')?.value).toBe('—');
  });
});
