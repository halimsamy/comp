import {
  renderAccessReviewPdf,
  summarizeItems,
  type ReportItem,
} from './access-review-report';

const item = (partial: Partial<ReportItem>): ReportItem => ({
  reviewSystemId: 'ars_1',
  accountName: 'jane',
  email: 'jane@acme.com',
  ownerName: 'Jane',
  roles: ['admin'],
  mfaEnabled: true,
  lastLoginAt: new Date('2026-11-01'),
  decision: 'keep',
  flags: [],
  remediatedAt: null,
  comment: null,
  decidedByName: 'Admin',
  decidedAt: new Date('2026-11-10'),
  remediationNote: null,
  ...partial,
});

describe('access review report', () => {
  it('summarizes decisions, flags and open remediation', () => {
    expect(
      summarizeItems([
        item({}),
        item({ decision: 'revoke', flags: ['owner_departed'] }),
        item({ decision: 'modify', remediatedAt: new Date() }),
        item({ decision: null, flags: ['inactive'] }),
      ]),
    ).toEqual({
      total: 4,
      decided: 3,
      kept: 1,
      revoked: 1,
      modified: 1,
      flagged: 2,
      pendingRemediation: 1,
    });
  });

  it('renders a PDF', () => {
    const pdf = renderAccessReviewPdf({
      review: {
        id: 'arv_abcdefgh',
        name: 'H2 2026',
        status: 'completed',
        dueDate: new Date('2026-12-31'),
        createdAt: new Date('2026-11-01'),
        createdByName: 'Admin',
        signedOffByName: 'CISO',
        signedOffAt: new Date('2026-11-18'),
        signOffNote: 'Access remains appropriate.',
        systems: [
          { id: 'ars_1', systemName: 'Google Workspace', reviewerName: 'CISO' },
        ],
        items: [
          item({}),
          item({
            decision: 'revoke',
            comment: 'Left',
            remediatedAt: new Date(),
          }),
        ],
      },
      organizationName: 'Acme',
      primaryColor: null,
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
