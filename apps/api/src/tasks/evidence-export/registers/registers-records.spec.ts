const mockDb = {
  accessReview: { findMany: jest.fn() },
  vendorReview: { findMany: jest.fn() },
  vendorDocument: { findMany: jest.fn() },
  riskReview: { findMany: jest.fn() },
  risk: { findMany: jest.fn() },
  taskItem: { findMany: jest.fn() },
  finding: { findMany: jest.fn() },
  member: { findMany: jest.fn() },
  trainingModule: { findMany: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('@trycompai/auth', () => ({ statement: {}, BUILT_IN_ROLE_PERMISSIONS: {} }));
jest.mock('../../../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
const mockListPrivileged = jest.fn();
const mockListRoles = jest.fn();
jest.mock('../../../access-reviews/access-exports', () => ({
  listPrivilegedAccounts: (...args: unknown[]) => mockListPrivileged(...args),
  listAccessRoles: (...args: unknown[]) => mockListRoles(...args),
}));
const mockListTraining = jest.fn();
jest.mock('../../../training/training-records.service', () => ({
  listTrainingRecords: (...args: unknown[]) => mockListTraining(...args),
}));
const mockListNc = jest.fn();
jest.mock('../../../isms/isms-nonconformity.service', () => ({
  IsmsNonconformityService: jest.fn(() => ({ list: mockListNc })),
}));

import { toCsv } from './register-csv';
import { REGISTERS } from './registers';

const ORG = { organizationId: 'org_1' };
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function parse(csv: string): Array<Record<string, string>> {
  const [header, ...rows] = csv.split('\n').map((line) => line.slice(1, -1).split('","'));
  return rows.map((row) => Object.fromEntries(header.map((h, i) => [h, row[i]])));
}

beforeEach(() => jest.clearAllMocks());

describe('register-csv dates (#84)', () => {
  it('renders a UTC-midnight date as that same day in any server time zone', () => {
    expect(toCsv({ headers: ['Day'], rows: [[d('2026-03-01')]] })).toBe('"Day"\n"2026-03-01"');
  });
});

describe('access registers', () => {
  it('summarizes each reviewed system of an access review campaign', async () => {
    mockDb.accessReview.findMany.mockResolvedValue([
      {
        name: 'Q1 2026 access review',
        status: 'completed',
        dueDate: d('2026-03-31'),
        signedOffByName: 'Ada',
        signedOffAt: d('2026-03-20'),
        systems: [{ id: 'ars_1', systemName: 'AWS', reviewerName: 'Bob' }],
        items: [
          { reviewSystemId: 'ars_1', decision: 'keep', remediatedAt: null },
          { reviewSystemId: 'ars_1', decision: 'revoke', remediatedAt: d('2026-03-21') },
          { reviewSystemId: 'ars_1', decision: 'modify', remediatedAt: null },
          { reviewSystemId: 'ars_1', decision: null, remediatedAt: null },
        ],
      },
    ]);

    const [row] = parse(await REGISTERS['access-reviews'].build(ORG));

    expect(mockDb.accessReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1' } }),
    );
    expect(row).toMatchObject({
      Campaign: 'Q1 2026 access review',
      System: 'AWS',
      Reviewer: 'Bob',
      Due: '2026-03-31',
      'Signed off at': '2026-03-20',
      Accounts: '4',
      Kept: '1',
      Revoked: '1',
      Modified: '1',
      Undecided: '1',
      'Changes remediated': '1',
      'Changes pending': '1',
    });
  });

  it('lists privileged users and approved roles', async () => {
    mockListPrivileged.mockResolvedValue([
      {
        systemName: 'GitHub',
        accountId: 'ada',
        name: null,
        email: 'ada@spare.test',
        ownerName: 'Ada',
        roles: ['admin'],
        mfaEnabled: true,
        lastLoginAt: d('2026-03-01'),
        flags: [],
      },
    ]);
    mockListRoles.mockResolvedValue([
      {
        systemName: 'AWS',
        name: 'Admin',
        permissionsScope: 'All',
        isPrivileged: true,
        approvedByName: 'Ada',
        approvedAt: d('2026-01-01'),
        lastReviewedAt: null,
      },
    ]);

    const [user] = parse(await REGISTERS['privileged-users'].build(ORG));
    const [role] = parse(await REGISTERS['access-roles'].build(ORG));

    expect(mockListPrivileged).toHaveBeenCalledWith('org_1');
    expect(user).toMatchObject({ System: 'GitHub', Account: 'ada', MFA: 'Yes', Roles: 'admin' });
    expect(role).toMatchObject({ System: 'AWS', Role: 'Admin', Privileged: 'Yes', 'Approved at': '2026-01-01' });
  });
});

describe('training, vendor and risk records', () => {
  it('lists training completions', async () => {
    mockListTraining.mockResolvedValue([
      {
        name: 'Ada',
        email: 'ada@spare.test',
        training: 'Security awareness training (sat-1)',
        completedAt: d('2026-02-01'),
        expiresAt: d('2027-02-01'),
        source: 'admin',
        hasAttachment: true,
      },
    ]);

    mockDb.trainingModule.findMany.mockResolvedValue([]);

    const [row] = parse(await REGISTERS['training-records'].build(ORG));

    expect(row).toMatchObject({ Completed: '2026-02-01', Expires: '2027-02-01', Source: 'Admin', 'Certificate attached': 'Yes' });
  });

  it('cites the requirements named by each completion\'s module', async () => {
    mockListTraining.mockResolvedValue([
      { moduleId: 'trm_1', training: 'Secure coding', completedAt: d('2026-02-01'), source: 'admin' },
      { moduleId: 'sat-1', training: 'Awareness', completedAt: d('2026-01-01'), source: 'portal' },
    ]);
    mockDb.trainingModule.findMany.mockResolvedValue([
      { id: 'trm_1', frameworkReference: 'PCI DSS 6.2.2' },
    ]);

    const table = await REGISTERS['training-records'].cited?.(ORG);

    expect(mockDb.trainingModule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1' } }),
    );
    expect(table?.cites).toEqual(['PCI DSS 6.2.2', '']);
  });

  it('lists vendor reviews with the documents reviewed by name', async () => {
    mockDb.vendorReview.findMany.mockResolvedValue([
      {
        vendor: { name: 'Stripe' },
        reviewedAt: d('2026-04-01'),
        reviewedByName: 'Ada',
        outcome: 'approved_with_conditions',
        criticality: 'high',
        pciStatus: 'compliant',
        checklist: { assuranceReviewed: true, contractReviewed: false },
        reviewedDocumentIds: ['vdoc_1'],
        conditions: ['Renew AOC'],
        notes: null,
        nextReviewDue: d('2027-04-01'),
      },
    ]);
    mockDb.vendorDocument.findMany.mockResolvedValue([{ id: 'vdoc_1', name: 'AOC 2026' }]);

    const [row] = parse(await REGISTERS['vendor-reviews'].build(ORG));

    expect(mockDb.vendorDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org_1', id: { in: ['vdoc_1'] } } }),
    );
    expect(row).toMatchObject({
      Vendor: 'Stripe',
      Outcome: 'Approved with conditions',
      'Checklist completed': 'Assurance reviewed',
      'Documents reviewed': 'AOC 2026',
      'Next review due': '2027-04-01',
    });
  });

  it('lists risk reviews with their frozen totals and the treatment actions', async () => {
    mockDb.riskReview.findMany.mockResolvedValue([
      {
        id: 'rskrv_1',
        createdAt: d('2026-03-01'),
        reviewedByName: 'Ada',
        trigger: 'significant_change',
        notes: null,
        nextReviewDue: d('2027-03-01'),
        snapshot: { totals: { risks: 12, overdueActions: 2 } },
      },
    ]);
    mockDb.risk.findMany.mockResolvedValue([{ id: 'rsk_1', title: 'Card data leak' }]);
    mockDb.taskItem.findMany.mockResolvedValue([
      {
        id: 'ti_1',
        title: 'Encrypt PAN',
        status: 'in_progress',
        priority: 'high',
        dueDate: d('2020-01-01'),
        completedAt: null,
        createdAt: d('2019-12-01'),
        entityId: 'rsk_1',
        assignee: null,
      },
    ]);

    const [review] = parse(await REGISTERS['risk-reviews'].build(ORG));
    const [action] = parse(await REGISTERS['risk-treatment-actions'].build(ORG));

    expect(review).toMatchObject({ Reason: 'Significant change', Risks: '12', 'Overdue actions': '2' });
    expect(action).toMatchObject({ Risk: 'Card data leak', Action: 'Encrypt PAN', Overdue: 'Yes' });
    expect(mockDb.taskItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org_1', entityType: 'risk', entityId: { in: ['rsk_1'] } },
      }),
    );
  });
});

describe('findings register (#171)', () => {
  it('reads the 10.2 register and adds platform findings not in it yet', async () => {
    mockListNc.mockResolvedValue({
      data: [
        {
          id: 'nc_1',
          kind: 'standalone',
          reference: 'NC-001',
          source: 'incident',
          sourceRef: 'INC-7',
          severity: null,
          description: 'Backup not tested',
          rootCause: null,
          correctiveAction: 'Test restore',
          ownerMemberId: 'mem_1',
          dueDate: d('2026-05-01'),
          status: 'open',
          closureEvidence: null,
          effectivenessReviewedAt: null,
          createdAt: d('2026-04-01'),
        },
      ],
    });
    mockDb.member.findMany.mockResolvedValue([{ id: 'mem_1', user: { name: 'Ada', email: 'a@x' } }]);
    mockDb.finding.findMany.mockResolvedValue([
      { id: 'nc_1' },
      {
        id: 'fnd_2',
        type: 'iso27001',
        severity: 'low',
        status: 'open',
        content: 'ISO 27001 A.5.1: Policy outdated',
        revisionNote: null,
        policy: { name: 'Access Control' },
        createdAt: d('2026-04-02'),
      },
    ]);

    const rows = parse(await REGISTERS.findings.build(ORG));

    expect(mockListNc).toHaveBeenCalledWith({ organizationId: 'org_1' });
    expect(rows.map((r) => [r.Reference, r.Kind, r.Source, r['Source reference'], r.Owner])).toEqual([
      ['NC-001', 'Standalone', 'Incident', 'INC-7', 'Ada'],
      ['fnd_2', 'Finding', 'Iso27001', 'Policy: Access Control', ''],
    ]);
    // Each row's citation prefix, for placing it under the requirements it names.
    expect((await REGISTERS.findings.cited?.(ORG))?.cites).toEqual(['', 'ISO 27001 A.5.1']);
  });
});
