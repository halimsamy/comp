jest.mock('@db', () => ({
  db: {
    member: { findMany: jest.fn() },
    accessAccountOwner: { findMany: jest.fn() },
    accessSystemRole: { findMany: jest.fn().mockResolvedValue([]) },
    accessSystem: { findMany: jest.fn() },
    accessSystemAccount: { findMany: jest.fn() },
  },
}));
jest.mock('@trycompai/integration-platform', () => ({
  TASK_TEMPLATES: { employeeAccess: 'frk_tt_ea' },
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { db } from '@db';
import type {
  CheckResultRow,
  CheckResultsService,
} from '../integration-platform/services/check-results.service';
import { AccessAccountsService } from './access-accounts.service';

const mocked = (fn: unknown) => fn as jest.Mock;
const ORG = 'org_1';
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000);

const members = [
  {
    id: 'mem_jane',
    role: 'owner',
    deactivated: false,
    offboardDate: null,
    createdAt: daysAgo(400),
    user: {
      name: 'Jane',
      email: 'Jane@acme.com',
      lastLogin: null,
      sessions: [{ createdAt: daysAgo(1) }],
    },
  },
  {
    id: 'mem_bob',
    role: 'employee',
    deactivated: true,
    offboardDate: daysAgo(10),
    createdAt: daysAgo(400),
    user: {
      name: 'Bob',
      email: 'bob@acme.com',
      lastLogin: daysAgo(200),
      sessions: [],
    },
  },
];

const row = (
  resourceId: string,
  evidence: Record<string, string | boolean>,
): CheckResultRow => ({
  resultId: `icr_${resourceId}`,
  resourceId,
  resourceType: 'user',
  passed: true,
  title: 'Account',
  description: null,
  evidence,
  collectedAt: new Date(),
  runId: 'run_1',
  connectionId: 'conn_gws',
});

describe('AccessAccountsService', () => {
  const checkResults = {
    listSourcesBoundToTask: jest.fn(),
    getLatestResultsByCheck: jest.fn(),
  };
  const service = new AccessAccountsService(
    checkResults as unknown as CheckResultsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mocked(db.member.findMany).mockResolvedValue(members);
    mocked(db.accessAccountOwner.findMany).mockResolvedValue([]);
    mocked(db.accessSystem.findMany).mockResolvedValue([]);
    checkResults.listSourcesBoundToTask.mockResolvedValue([
      {
        slug: 'google-workspace',
        name: 'Google Workspace',
        logoUrl: null,
        checkId: 'employee-access',
        connected: true,
        connectionId: 'conn_gws',
        lastSyncAt: null,
      },
      {
        slug: 'github',
        name: 'GitHub',
        checkId: 'org_members',
        connected: false,
        connectionId: null,
      },
    ]);
  });

  it('lists Comp AI, connected integrations and manual systems', async () => {
    mocked(db.accessSystem.findMany).mockResolvedValue([
      { id: 'asy_1', name: 'Bank portal', description: null, importedAt: null },
    ]);
    checkResults.getLatestResultsByCheck.mockResolvedValue([]);
    mocked(db.accessSystemAccount.findMany).mockResolvedValue([]);

    const systems = await service.listSystems(ORG);

    expect(systems.map((s) => s.key)).toEqual([
      'compai',
      'connection:conn_gws',
      'manual:asy_1',
    ]);
    expect(systems[0]).toMatchObject({ accountCount: 2, flaggedCount: 1 });
    expect(db.accessSystem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG } }),
    );
  });

  it('maps integration accounts to owners by email and pre-flags them', async () => {
    checkResults.getLatestResultsByCheck.mockResolvedValue([
      row('jane@acme.com', {
        name: 'Jane',
        isAdmin: true,
        isEnrolledIn2Sv: false,
        lastLoginTime: daysAgo(2).toISOString(),
      }),
      row('bob@acme.com', {
        name: 'Bob',
        suspended: false,
        lastLoginTime: daysAgo(120).toISOString(),
      }),
      row('ci@acme.com', {
        name: 'CI',
        lastLoginTime: '1970-01-01T00:00:00.000Z',
        creationTime: daysAgo(5).toISOString(),
      }),
    ]);

    const { accounts } = await service.getSystemAccounts({
      organizationId: ORG,
      systemKey: 'connection:conn_gws',
    });

    expect(checkResults.getLatestResultsByCheck).toHaveBeenCalledWith({
      organizationId: ORG,
      connectionId: 'conn_gws',
      checkId: 'employee-access',
      resourceType: 'user',
    });
    const [jane, bob, ci] = accounts;
    expect(jane.owner?.memberId).toBe('mem_jane');
    expect(jane.flags).toEqual(['admin', 'no_mfa']);
    expect(bob.flags).toEqual(['owner_departed', 'inactive']);
    expect(ci.owner).toBeNull();
    expect(ci.flags).toEqual(['unmapped']);
  });

  it('applies manual owner mappings and service-account marks', async () => {
    mocked(db.accessAccountOwner.findMany).mockResolvedValue([
      {
        systemKey: 'connection:conn_gws',
        accountId: 'acme/jane',
        memberId: 'mem_jane',
        isServiceAccount: false,
        justification: null,
      },
      {
        systemKey: 'connection:conn_gws',
        accountId: 'acme/bot',
        memberId: null,
        isServiceAccount: true,
        justification: 'Deploys',
      },
    ]);
    checkResults.getLatestResultsByCheck.mockResolvedValue([
      row('acme/jane', { accountName: 'jane' }),
      row('acme/bot', { accountName: 'bot' }),
    ]);

    const { accounts } = await service.getSystemAccounts({
      organizationId: ORG,
      systemKey: 'connection:conn_gws',
    });

    expect(accounts[0]).toMatchObject({ ownerSource: 'manual', flags: [] });
    expect(accounts[1]).toMatchObject({
      isServiceAccount: true,
      justification: 'Deploys',
      flags: [],
    });
  });

  it('treats Comp AI members as accounts with their roles', async () => {
    const { accounts } = await service.getSystemAccounts({
      organizationId: ORG,
      systemKey: 'compai',
    });
    expect(accounts[0]).toMatchObject({
      accountId: 'jane@acme.com',
      isAdmin: true,
      roles: ['owner'],
      lastLoginAt: daysAgo(1),
    });
    // A deactivated member has no live access, so no "owner left" flag.
    expect(accounts[1]).toMatchObject({ status: 'deactivated', flags: [] });
  });

  it('reads manual system accounts scoped to the organization', async () => {
    mocked(db.accessSystem.findMany).mockResolvedValue([
      { id: 'asy_1', name: 'Bank portal', description: null, importedAt: null },
    ]);
    mocked(db.accessSystemAccount.findMany).mockResolvedValue([
      {
        externalId: 'jdoe',
        name: null,
        email: 'JANE@acme.com',
        type: null,
        status: null,
        roles: [],
        isAdmin: false,
        mfaEnabled: true,
        lastLoginAt: null,
        accountCreatedAt: null,
      },
    ]);

    const { accounts } = await service.getSystemAccounts({
      organizationId: ORG,
      systemKey: 'manual:asy_1',
    });

    expect(db.accessSystemAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { systemId: 'asy_1', system: { organizationId: ORG } },
      }),
    );
    expect(accounts[0]).toMatchObject({
      name: 'jdoe',
      status: 'active',
      owner: { memberId: 'mem_jane' },
    });
  });

  it('rejects unknown or malformed system keys', async () => {
    await expect(
      service.getSystemAccounts({
        organizationId: ORG,
        systemKey: 'manual:asy_other',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getSystemAccounts({
        organizationId: ORG,
        systemKey: 'drop table',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
