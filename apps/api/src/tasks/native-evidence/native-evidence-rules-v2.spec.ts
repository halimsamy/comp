const mockDb = {
  asset: { findMany: jest.fn() },
  vulnerabilityScan: { findFirst: jest.fn() },
  integrationPlatformFinding: { findMany: jest.fn() },
  organizationChartSnapshot: { findFirst: jest.fn() },
  member: { findMany: jest.fn() },
  organization: { findUnique: jest.fn() },
  vendor: { findMany: jest.fn() },
  ismsDocument: { findFirst: jest.fn() },
  ismsRoleAssignment: { findMany: jest.fn() },
  control: { findMany: jest.fn() },
  evidenceSubmission: { findFirst: jest.fn() },
};
const mockReviewStatus = jest.fn();
const mockRoleHolders = jest.fn();
const mockNcList = jest.fn();
const mockListAccounts = jest.fn();
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../../utils/compliance-filters', () => ({ filterComplianceMembers: async <T>(m: T[]) => m }));
jest.mock('../../assets/asset-review', () => ({ reviewStatus: (...a: unknown[]) => mockReviewStatus(...a) }));
jest.mock('../../controls/controls-owner-suggestions', () => ({ loadRoleHolders: (...a: unknown[]) => mockRoleHolders(...a) }));
jest.mock('../../isms/isms-nonconformity.service', () => ({
  IsmsNonconformityService: jest.fn(() => ({ list: (...a: unknown[]) => mockNcList(...a) })),
}));
jest.mock('../../access-reviews/access-accounts.service', () => ({
  createAccessAccountsService: () => ({ listAllAccounts: (...a: unknown[]) => mockListAccounts(...a) }),
}));

import { authenticationRule, employeeAccessRule } from './rules/access-security-rules';
import { supplierContractRule } from './rules/access-vendor-rules';
import { asvScanRule, assetInventoryRule, cdeScopeRule, vulnerabilityRemediationRule } from './rules/asset-scan-rules';
import { communicationPlanRule, correctiveActionRule, pciExecutiveRule, tabletopRule } from './rules/governance-rules';
import { orgChartRule } from './rules/org-chart-rule';

const NOW = new Date('2026-11-18T00:00:00Z');
const ctx = { organizationId: 'org_1', now: NOW, frequency: null };
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const asset = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, type: 'compute', environment: 'production', cdeScope: 'in_scope', ownerId: 'm1',
  owner: { user: { name: 'Ann', email: 'a@x.io' } }, ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('asset and scan rules', () => {
  it('inventory needs owners, assessed scope and a review in 12 months', async () => {
    mockReviewStatus.mockResolvedValue({ lastReviewedAt: daysAgo(30), reviewedBy: { name: 'Ann', email: 'a@x.io' } });
    mockDb.asset.findMany.mockResolvedValue([asset('db')]);
    expect((await assetInventoryRule.evaluate(ctx)).holds).toBe(true);
    expect(mockDb.asset.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org_1', archivedAt: null });

    mockDb.asset.findMany.mockResolvedValue([asset('db', { ownerId: null }), asset('s3', { cdeScope: 'unassessed' })]);
    const result = await assetInventoryRule.evaluate(ctx);
    expect(result.holds).toBe(false);
    expect(result.issues).toEqual(['No owner: db', 'Scope not assessed: s3']);
    // The scope pack ignores owners.
    mockDb.asset.findMany.mockResolvedValue([asset('db', { ownerId: null })]);
    expect((await cdeScopeRule.evaluate(ctx)).holds).toBe(true);

    mockReviewStatus.mockResolvedValue({ lastReviewedAt: daysAgo(400), reviewedBy: null });
    expect((await cdeScopeRule.evaluate(ctx)).holds).toBe(false);
  });

  it('ASV needs a passing external scan in 90 days', async () => {
    mockDb.vulnerabilityScan.findFirst.mockResolvedValue({ id: 's', scannedAt: daysAgo(20), passed: true, vendor: 'X', findingCount: 0 });
    expect((await asvScanRule.evaluate(ctx)).holds).toBe(true);
    expect(mockDb.vulnerabilityScan.findFirst.mock.calls[0][0].where).toEqual({ organizationId: 'org_1', kind: 'external_asv', passed: true });
    mockDb.vulnerabilityScan.findFirst.mockResolvedValue({ id: 's', scannedAt: daysAgo(120), passed: true, vendor: 'X', findingCount: 0 });
    expect((await asvScanRule.evaluate(ctx)).holds).toBe(false);
  });

  it('remediation fails on critical or high past SLA, or no internal scan', async () => {
    mockDb.vulnerabilityScan.findFirst.mockResolvedValue({ id: 's', scannedAt: daysAgo(10), passed: null, vendor: null, findingCount: 2 });
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([]);
    expect((await vulnerabilityRemediationRule.evaluate(ctx)).holds).toBe(true);
    expect(mockDb.integrationPlatformFinding.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1', status: 'open', severity: { in: ['critical', 'high'] },
    });
    mockDb.integrationPlatformFinding.findMany.mockResolvedValue([{ id: 'f', title: 'CVE-1', severity: 'high', slaDueAt: daysAgo(1) }]);
    expect((await vulnerabilityRemediationRule.evaluate(ctx)).issues).toEqual(['Past SLA: CVE-1']);
  });
});

describe('org chart (#43)', () => {
  const members = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, user: { name: `M${i}`, email: `m${i}@x.io` } }));
  const snapshot = (ids: string[]) => ({
    id: 'ocs', name: 'Q4', createdAt: daysAgo(20), nodes: ids.map((id) => ({ data: { name: id, title: 'T', memberId: id } })),
  });

  it('needs 90% of people and every role holder, and names who is missing', async () => {
    mockDb.member.findMany.mockResolvedValue(members);
    mockRoleHolders.mockResolvedValue([{ roleKey: 'spo', roleName: 'SPO', memberId: 'm9', memberName: 'M9' }]);
    mockDb.organizationChartSnapshot.findFirst.mockResolvedValue(snapshot(members.slice(0, 9).map((m) => m.id)));
    const result = await orgChartRule.evaluate(ctx);
    expect(result.holds).toBe(false);
    expect(result.issues).toEqual(['ISMS role holders missing from the chart: M9 (SPO)', 'Not on the chart: M9']);

    mockRoleHolders.mockResolvedValue([]);
    expect((await orgChartRule.evaluate(ctx)).holds).toBe(true);
    mockDb.organizationChartSnapshot.findFirst.mockResolvedValue(snapshot(['m0', 'm1', 'm2']));
    expect((await orgChartRule.evaluate(ctx)).holds).toBe(false);
  });
});

describe('governance rules', () => {
  const nc = (extra: Record<string, unknown>) => ({
    id: 'n', kind: 'standalone', reference: 'NC-01', source: 'incident', status: 'open', dueDate: null,
    effectivenessReviewedAt: null, createdAt: daysAgo(10), ...extra,
  });

  it('corrective actions: nothing overdue and closed ones reviewed', async () => {
    mockNcList.mockResolvedValue({ data: [nc({ dueDate: daysAgo(-5) })] });
    expect((await correctiveActionRule.evaluate(ctx)).holds).toBe(true);
    mockNcList.mockResolvedValue({ data: [nc({ dueDate: daysAgo(5) }), nc({ reference: 'NC-02', status: 'closed' })] });
    expect((await correctiveActionRule.evaluate(ctx)).issues).toEqual([
      'Past due: NC-01',
      'Closed without an effectiveness review: NC-02',
    ]);
    expect(mockNcList).toHaveBeenCalledWith({ organizationId: 'org_1' });
  });

  it('communication plan needs both documents approved and roles acknowledged', async () => {
    const doc = { id: 'd', title: 'Roles', currentVersion: { id: 'v', version: 1, publishedAt: daysAgo(3) } };
    mockDb.ismsDocument.findFirst.mockResolvedValue(doc);
    mockDb.ismsRoleAssignment.findMany.mockResolvedValue([{ memberId: 'm1', acknowledgedAt: daysAgo(1), role: { name: 'SPO' } }]);
    mockDb.member.findMany.mockResolvedValue([{ id: 'm1', user: { name: 'Ann', email: 'a@x.io' } }]);
    expect((await communicationPlanRule.evaluate(ctx)).holds).toBe(true);
    mockDb.ismsRoleAssignment.findMany.mockResolvedValue([{ memberId: 'm1', acknowledgedAt: null, role: { name: 'SPO' } }]);
    expect((await communicationPlanRule.evaluate(ctx)).issues).toEqual(['Role not acknowledged: Ann (SPO)']);
  });

  it('PCI executive accountability needs an acknowledged owner and owned PCI controls', async () => {
    mockDb.ismsRoleAssignment.findMany.mockResolvedValue([{ memberId: 'm1', acknowledgedAt: daysAgo(1), role: { name: 'PCI owner' } }]);
    mockDb.member.findMany.mockResolvedValue([{ id: 'm1', user: { name: 'Ann', email: 'a@x.io' } }]);
    mockDb.control.findMany.mockResolvedValue([{ id: 'c1', name: 'Firewalls', ownerId: null }]);
    const result = await pciExecutiveRule.evaluate(ctx);
    expect(result.holds).toBe(false);
    expect(result.issues).toEqual(['PCI controls without an owner: Firewalls']);
    expect(mockDb.ismsRoleAssignment.findMany.mock.calls[0][0].where.role).toMatchObject({ roleKey: 'pci_executive_owner' });
  });

  it('tabletop needs a submission in 12 months', async () => {
    mockDb.evidenceSubmission.findFirst.mockResolvedValue({ id: 'e', submittedAt: daysAgo(100), status: 'approved', submittedBy: null });
    expect((await tabletopRule.evaluate(ctx)).holds).toBe(true);
    mockDb.evidenceSubmission.findFirst.mockResolvedValue(null);
    expect((await tabletopRule.evaluate(ctx)).holds).toBe(false);
  });
});

describe('access and supplier rules', () => {
  const account = (extra: Record<string, unknown>) => ({
    accountId: 'a', name: 'Ann', email: 'a@x.io', type: 'human', status: 'active', roles: ['admin'], isAdmin: true,
    mfaEnabled: true, owner: { memberId: 'm1', name: 'Ann' }, isServiceAccount: false, justification: null, flags: [], ...extra,
  });

  it('employee access flags unowned accounts and unapproved roles', async () => {
    mockListAccounts.mockResolvedValue([
      { system: { name: 'Google' }, accounts: [account({}), account({ accountId: 'b', email: 'b@x.io', flags: ['unmapped', 'role_not_approved'] })] },
    ]);
    const result = await employeeAccessRule.evaluate(ctx);
    expect(result.holds).toBe(false);
    expect(result.issues).toEqual(['No owner or justification: b@x.io (Google)', 'Role not approved: b@x.io (Google)']);
  });

  it('2FA needs MFA on human accounts and an idle timeout of 15 minutes or less', async () => {
    mockListAccounts.mockResolvedValue([
      { system: { name: 'Google' }, accounts: [account({}), account({ accountId: 's', type: 'service', mfaEnabled: false })] },
    ]);
    mockDb.organization.findUnique.mockResolvedValue({ sessionIdleTimeoutMinutes: 15 });
    expect((await authenticationRule.evaluate(ctx)).holds).toBe(true);
    mockDb.organization.findUnique.mockResolvedValue({ sessionIdleTimeoutMinutes: 30 });
    expect((await authenticationRule.evaluate(ctx)).holds).toBe(false);
    mockDb.organization.findUnique.mockResolvedValue({ sessionIdleTimeoutMinutes: 10 });
    mockListAccounts.mockResolvedValue([{ system: { name: 'Google' }, accounts: [account({ mfaEnabled: false })] }]);
    expect((await authenticationRule.evaluate(ctx)).issues).toEqual(['No MFA: a@x.io (Google)']);
  });

  it('supplier contracts need dates, clauses and the 12.8.2 acknowledgement for TPSPs', async () => {
    const vendor = (extra: Record<string, unknown>) => ({
      id: 'v', name: 'Stripe', criticality: 'critical', handlesCardholderData: true, affectsCdeSecurity: false,
      inherentProbability: 'very_unlikely', inherentImpact: 'insignificant', contractStartDate: daysAgo(100), contractEndDate: null,
      securityClausesConfirmed: true, confidentialityClausesConfirmed: true, tpspAcknowledgementDate: daysAgo(90), ...extra,
    });
    mockDb.vendor.findMany.mockResolvedValue([vendor({})]);
    expect((await supplierContractRule.evaluate(ctx)).holds).toBe(true);
    expect(mockDb.vendor.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org_1', archivedAt: null });
    mockDb.vendor.findMany.mockResolvedValue([vendor({ tpspAcknowledgementDate: null, contractStartDate: null })]);
    expect((await supplierContractRule.evaluate(ctx)).issues).toEqual(['Missing: Stripe (contract dates, 12.8.2 acknowledgement)']);
  });
});
