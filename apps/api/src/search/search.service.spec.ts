const mockDb = {
  frameworkInstance: { findMany: jest.fn() },
  control: { findMany: jest.fn() },
  policy: { findMany: jest.fn() },
  task: { findMany: jest.fn() },
  risk: { findMany: jest.fn() },
  vendor: { findMany: jest.fn() },
  member: { findMany: jest.fn() },
  ismsDocument: { findMany: jest.fn() },
  organizationRole: { findMany: jest.fn() },
  asset: { findMany: jest.fn().mockResolvedValue([]) },
  integrationPlatformFinding: { findMany: jest.fn().mockResolvedValue([]) },
  finding: { findMany: jest.fn().mockResolvedValue([]) },
  auditEngagement: { findMany: jest.fn().mockResolvedValue([]) },
  questionnaire: { findMany: jest.fn().mockResolvedValue([]) },
  accessReview: { findMany: jest.fn().mockResolvedValue([]) },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../auth/auth.server', () => ({
  auth: { api: { getSession: jest.fn() } },
}));
jest.mock('@trycompai/auth', () => ({
  statement: {},
  BUILT_IN_ROLE_PERMISSIONS: {
    owner: {
      app: ['read'],
      framework: ['read'],
      control: ['read'],
      policy: ['read'],
      task: ['read'],
      evidence: ['read'],
      risk: ['read'],
      vendor: ['read'],
      member: ['read'],
    },
    auditor: { app: ['read'], policy: ['read'], control: ['read'] },
  },
}));
jest.mock('../frameworks/frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: jest.fn().mockResolvedValue([
    {
      id: 'req_1',
      identifier: '8.3.6',
      name: 'Passwords meet minimum complexity',
      description:
        'If passwords are used as authentication factors they meet the following minimum level of complexity: a minimum length of 12 characters...',
    },
  ]),
}));

import { PERMISSIONS_KEY } from '../auth/permission.guard';
import type { AuthContext } from '../auth/types';
import { SearchController } from './search.controller';
import { requirementTitle, SearchService } from './search.service';

const ctx = (overrides: Partial<AuthContext>): AuthContext => ({
  organizationId: 'org_1',
  authType: 'session',
  isApiKey: false,
  isPlatformAdmin: false,
  userRoles: ['owner'],
  ...overrides,
});

function seedDb() {
  mockDb.frameworkInstance.findMany.mockResolvedValue([
    {
      id: 'frm_1',
      frameworkId: 'fw_pci',
      customFrameworkId: null,
      currentVersionId: null,
      framework: { name: 'PCI DSS Level 1' },
      customFramework: null,
    },
  ]);
  mockDb.control.findMany.mockResolvedValue([
    { id: 'ctl_1', name: 'Access Rights', description: null },
  ]);
  mockDb.policy.findMany.mockResolvedValue([
    { id: 'pol_1', name: 'Access Control Policy', status: 'needs_review' },
  ]);
  mockDb.task.findMany.mockResolvedValue([
    { id: 'tsk_1', title: 'MFA evidence', status: 'in_progress' },
  ]);
  mockDb.risk.findMany.mockResolvedValue([
    { id: 'rsk_1', title: 'Phishing', category: 'human_resources' },
  ]);
  mockDb.vendor.findMany.mockResolvedValue([
    { id: 'vnd_1', name: 'AWS', website: 'aws.amazon.com' },
  ]);
  mockDb.member.findMany.mockResolvedValue([
    { id: 'mem_1', user: { name: '', email: 'a@spare.test' } },
  ]);
  mockDb.ismsDocument.findMany.mockResolvedValue([
    {
      type: 'isms_scope',
      title: 'ISMS Scope',
      requirement: { identifier: '4.3' },
    },
  ]);
  mockDb.organizationRole.findMany.mockResolvedValue([]);
}

describe('SearchService', () => {
  const service = new SearchService();
  beforeEach(() => {
    jest.clearAllMocks();
    seedDb();
  });

  it('indexes every object type for a caller who can read them all, scoped to the org', async () => {
    const entries = await service.buildIndex({
      organizationId: 'org_1',
      authContext: ctx({}),
    });

    expect(entries.map((e) => e.type)).toEqual([
      'requirement',
      'control',
      'policy',
      'task',
      'risk',
      'vendor',
      'person',
      'isms_document',
    ]);
    expect(entries[0]).toMatchObject({
      id: 'req_1',
      parentId: 'frm_1',
      label: 'PCI DSS 8.3.6 · Passwords meet minimum complexity',
    });
    expect(entries.find((e) => e.type === 'person')).toMatchObject({
      label: 'a@spare.test',
    });
    expect(entries.find((e) => e.type === 'isms_document')).toMatchObject({
      id: 'isms_scope',
      description: 'ISMS document · clause 4.3',
    });
    for (const call of [
      mockDb.control.findMany,
      mockDb.policy.findMany,
      mockDb.task.findMany,
      mockDb.member.findMany,
    ]) {
      expect(call.mock.calls[0][0].where.organizationId).toBe('org_1');
    }
  });

  it('leaves out object types the caller has no read permission for', async () => {
    const entries = await service.buildIndex({
      organizationId: 'org_1',
      authContext: ctx({ userRoles: ['auditor'] }),
    });

    expect([...new Set(entries.map((e) => e.type))]).toEqual([
      'control',
      'policy',
    ]);
    expect(mockDb.member.findMany).not.toHaveBeenCalled();
    expect(mockDb.risk.findMany).not.toHaveBeenCalled();
  });

  it('honours API key scopes', async () => {
    const entries = await service.buildIndex({
      organizationId: 'org_1',
      authContext: ctx({
        isApiKey: true,
        authType: 'api-key',
        apiKeyScopes: ['app:read', 'vendor:read'],
      }),
    });
    expect(entries.map((e) => e.type)).toEqual(['vendor']);
  });
});

describe('requirementTitle', () => {
  it('shortens long PCI requirement names', () => {
    const title = requirementTitle({
      identifier: '8.3.6',
      name: 'x'.repeat(150),
      description: 'y'.repeat(300),
    });
    expect(title).toHaveLength(90);
    expect(title.endsWith('…')).toBe(true);
  });

  it('uses the short ISO clause title stored in the description', () => {
    expect(
      requirementTitle({
        identifier: 'A.8.13',
        name: 'A.8.13 Technological Controls',
        description: 'Information backup',
      }),
    ).toBe('Information backup');
  });

  it('strips the identifier from the name when the description is long', () => {
    expect(
      requirementTitle({
        identifier: '1.2',
        name: '1.2 Network controls',
        description: 'x'.repeat(200),
      }),
    ).toBe('Network controls');
  });
});

describe('SearchController', () => {
  it('wraps the index in the list response shape and requires app:read', async () => {
    const service = {
      buildIndex: jest.fn().mockResolvedValue([{ type: 'policy' }]),
    };
    const controller = new SearchController(
      service as unknown as SearchService,
    );

    await expect(controller.getIndex('org_1', ctx({}))).resolves.toEqual({
      data: [{ type: 'policy' }],
      count: 1,
    });
    expect(service.buildIndex).toHaveBeenCalledWith({
      organizationId: 'org_1',
      authContext: ctx({}),
    });
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, SearchController.prototype.getIndex),
    ).toEqual([{ resource: 'app', actions: ['read'] }]);
  });
});
