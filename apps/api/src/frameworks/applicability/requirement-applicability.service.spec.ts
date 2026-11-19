import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  frameworkInstance: { findFirst: jest.fn() },
  requirementApplicability: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
  control: { count: jest.fn() },
  evidenceSubmission: { findFirst: jest.fn() },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};
jest.mock('@db', () => ({ db: mockDb, Prisma: { DbNull: 'DbNull' } }));
jest.mock('../frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: jest.fn(),
}));
jest.mock('../../soa/utils/soa-answer-writer', () => ({
  writeSoaAnswerForAnnexA: jest.fn(),
}));

import { writeSoaAnswerForAnnexA } from '../../soa/utils/soa-answer-writer';
import { loadRequirementDefinitions } from '../frameworks-requirements.helper';
import {
  findChildRequirements,
  RequirementApplicabilityService,
} from './requirement-applicability.service';

const service = new RequirementApplicabilityService();
const instance = (name: string) => ({
  id: 'fi_1',
  frameworkId: 'frk_1',
  customFrameworkId: null,
  currentVersionId: null,
  framework: { name },
  customFramework: null,
});
const base = { organizationId: 'org_1', frameworkInstanceId: 'fi_1', memberId: 'mem_1', userId: 'usr_1' };
const ccw = {
  kind: 'compensating_control',
  constraints: 'Legacy HSM',
  objective: 'Rotate keys',
  identifiedRisk: 'Stale keys',
  compensatingControlIds: ['ctl_1'],
  validation: 'Quarterly review',
  maintenance: 'Calendar',
  revalidateAt: '2027-11-18',
};

beforeEach(() => {
  jest.clearAllMocks();
  (loadRequirementDefinitions as jest.Mock).mockResolvedValue([
    { id: 'req_pci', identifier: '1.2', name: 'NSC configuration' },
    { id: 'req_pci_1', identifier: '1.2.1', name: 'child' },
    { id: 'req_pci_2', identifier: '1.2.8', name: 'child' },
    { id: 'req_pci_other', identifier: '1.20', name: 'not a child' },
    { id: 'req_ineligible', identifier: '3.3.1', name: 'SAD' },
    { id: 'req_annex', identifier: 'A.7.4', name: 'A.7.4' },
    { id: 'req_clause', identifier: '6.1.3', name: '6.1.3' },
  ]);
  mockDb.requirementApplicability.upsert.mockResolvedValue({ id: 'rap_1' });
});

describe('RequirementApplicabilityService.set', () => {
  it('scopes the instance lookup to the organization', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(null);
    await expect(
      service.set({ ...base, requirementKey: 'req_pci', dto: { status: 'applicable' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockDb.frameworkInstance.findFirst.mock.calls[0][0].where).toEqual({
      id: 'fi_1',
      organizationId: 'org_1',
    });
  });

  it('stores a PCI compensating control with its worksheet', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    mockDb.control.count.mockResolvedValue(1);
    await service.set({
      ...base,
      requirementKey: 'req_pci',
      dto: { status: 'compensating_control', justification: '  CCW-01 covers it ', details: ccw },
    });
    expect(mockDb.control.count.mock.calls[0][0].where).toEqual({
      id: { in: ['ctl_1'] },
      organizationId: 'org_1',
    });
    const call = mockDb.requirementApplicability.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({
      organizationId: 'org_1',
      status: 'compensating_control',
      justification: 'CCW-01 covers it',
      details: ccw,
      source: 'manual',
      updatedById: 'mem_1',
    });
  });

  it('rejects a compensating control without its worksheet', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    await expect(
      service.set({
        ...base,
        requirementKey: 'req_pci',
        dto: { status: 'compensating_control', justification: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockDb.requirementApplicability.upsert).not.toHaveBeenCalled();
  });

  it('rejects compensating controls from another organization', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    mockDb.control.count.mockResolvedValue(0);
    await expect(
      service.set({
        ...base,
        requirementKey: 'req_pci',
        dto: { status: 'compensating_control', justification: 'x', details: ccw },
      }),
    ).rejects.toThrow('Unknown compensating control');
  });

  it('blocks the customized approach where PCI has no customized objective', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    await expect(
      service.set({
        ...base,
        requirementKey: 'req_ineligible',
        dto: { status: 'customized_approach', justification: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears justification and details when set back to applicable', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    await service.set({
      ...base,
      requirementKey: 'req_pci',
      dto: { status: 'applicable', justification: 'old reason', details: ccw },
    });
    expect(mockDb.requirementApplicability.upsert.mock.calls[0][0].update).toMatchObject({
      status: 'applicable',
      justification: null,
      details: 'DbNull',
    });
  });

  it('cascades not applicable to sub-requirements in one transaction', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    const result = await service.set({
      ...base,
      requirementKey: 'req_pci',
      dto: { status: 'not_applicable', justification: 'No wireless', applyToChildren: true },
    });
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    const keys = mockDb.requirementApplicability.upsert.mock.calls.map(
      (c) => c[0].where.frameworkInstanceId_requirementKey.requirementKey,
    );
    expect(keys).toEqual(['req_pci', 'req_pci_1', 'req_pci_2']);
    expect(mockDb.requirementApplicability.upsert.mock.calls[1][0].create).toMatchObject({
      status: 'not_applicable',
      justification: 'No wireless',
      details: { kind: 'not_applicable', sourceRequirementId: 'req_pci' },
    });
    expect(result.cascaded).toBe(2);
  });

  it('requires a justification unless applicable', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    await expect(
      service.set({ ...base, requirementKey: 'req_pci', dto: { status: 'not_applicable', justification: ' ' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses PCI-only statuses on other frameworks', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('SOC 2'));
    await expect(
      service.set({ ...base, requirementKey: 'req_pci', dto: { status: 'customized_approach', justification: 'x' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes ISO Annex A to the SoA instead of the applicability table', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('ISO 27001'));
    mockDb.requirementApplicability.findFirst.mockResolvedValue({ id: 'rap_soa', source: 'soa' });
    const result = await service.set({
      ...base,
      requirementKey: 'req_annex',
      dto: { status: 'not_applicable', justification: 'Fully remote' },
    });
    expect(writeSoaAnswerForAnnexA).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        frameworkId: 'frk_1',
        identifier: 'A.7.4',
        isApplicable: false,
        justification: 'Fully remote',
        userId: 'usr_1',
      }),
    );
    expect(mockDb.requirementApplicability.upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'rap_soa', source: 'soa' });
  });

  it('keeps ISO clauses 4-10 mandatory', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('ISO 27001'));
    await expect(
      service.set({ ...base, requirementKey: 'req_clause', dto: { status: 'not_applicable', justification: 'x' } }),
    ).rejects.toThrow('mandatory');
    expect(mockDb.requirementApplicability.upsert).not.toHaveBeenCalled();
  });

  it('404s on an unknown requirement', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    await expect(
      service.set({ ...base, requirementKey: 'nope', dto: { status: 'applicable' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('findChildRequirements', () => {
  it('matches by identifier prefix only', () => {
    const requirements = [
      { id: 'a', identifier: '1.2' },
      { id: 'b', identifier: '1.2.1' },
      { id: 'c', identifier: '1.20' },
      { id: 'd', identifier: '1.2.1.1' },
    ];
    expect(
      findChildRequirements({ requirements, parent: requirements[0] }).map((r) => r.id),
    ).toEqual(['b', 'd']);
    expect(findChildRequirements({ requirements, parent: { id: 'x', identifier: '' } })).toEqual([]);
  });
});

describe('RequirementApplicabilityService.list', () => {
  it('lists only the organization rows', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    mockDb.requirementApplicability.findMany.mockResolvedValue([{ id: 'rap_1' }]);
    const result = await service.list({ organizationId: 'org_1', frameworkInstanceId: 'fi_1' });
    expect(mockDb.requirementApplicability.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      frameworkInstanceId: 'fi_1',
    });
    expect(result.count).toBe(1);
  });
});
