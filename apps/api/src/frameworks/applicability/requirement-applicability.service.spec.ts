import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  frameworkInstance: { findFirst: jest.fn() },
  requirementApplicability: { findMany: jest.fn(), upsert: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../frameworks-requirements.helper', () => ({
  loadRequirementDefinitions: jest.fn(),
}));

import { loadRequirementDefinitions } from '../frameworks-requirements.helper';
import { RequirementApplicabilityService } from './requirement-applicability.service';

const service = new RequirementApplicabilityService();
const instance = (name: string) => ({
  id: 'fi_1',
  frameworkId: 'frk_1',
  customFrameworkId: null,
  currentVersionId: null,
  framework: { name },
  customFramework: null,
});
const base = { organizationId: 'org_1', frameworkInstanceId: 'fi_1', memberId: 'mem_1' };

beforeEach(() => {
  jest.clearAllMocks();
  (loadRequirementDefinitions as jest.Mock).mockResolvedValue([
    { id: 'req_pci', identifier: '', name: '1.2.3 NSCs' },
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

  it('stores a PCI compensating control with its justification', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('PCI DSS Level 1'));
    await service.set({
      ...base,
      requirementKey: 'req_pci',
      dto: { status: 'compensating_control', justification: '  CCW-01 covers it ' },
    });
    const call = mockDb.requirementApplicability.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      frameworkInstanceId_requirementKey: { frameworkInstanceId: 'fi_1', requirementKey: 'req_pci' },
    });
    expect(call.create).toMatchObject({
      organizationId: 'org_1',
      status: 'compensating_control',
      justification: 'CCW-01 covers it',
      source: 'manual',
      updatedById: 'mem_1',
    });
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

  it('sends ISO Annex A to the SoA and keeps clauses 4-10 mandatory', async () => {
    mockDb.frameworkInstance.findFirst.mockResolvedValue(instance('ISO 27001'));
    await expect(
      service.set({ ...base, requirementKey: 'req_annex', dto: { status: 'not_applicable', justification: 'x' } }),
    ).rejects.toThrow('Statement of Applicability');
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
