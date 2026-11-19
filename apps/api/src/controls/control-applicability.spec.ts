const mockDb = { requirementApplicability: { findMany: jest.fn() } };
jest.mock('@db', () => ({ db: mockDb }));

import { loadMappedApplicability } from './control-applicability';

describe('loadMappedApplicability', () => {
  it('keys statuses by framework and requirement, scoped to the organization', async () => {
    mockDb.requirementApplicability.findMany.mockResolvedValue([
      { frameworkInstanceId: 'fi_pci', requirementKey: 'req_1', status: 'not_applicable' },
    ]);
    const result = await loadMappedApplicability({
      organizationId: 'org_1',
      maps: [
        { frameworkInstanceId: 'fi_pci', requirementId: 'req_1', customRequirementId: null },
        { frameworkInstanceId: 'fi_iso', requirementId: null, customRequirementId: 'creq_1' },
      ],
    });
    expect(mockDb.requirementApplicability.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org_1',
      OR: [
        { frameworkInstanceId: 'fi_pci', requirementKey: 'req_1' },
        { frameworkInstanceId: 'fi_iso', requirementKey: 'creq_1' },
      ],
    });
    expect(result).toEqual({ 'fi_pci:req_1': 'not_applicable' });
  });

  it('skips the query when nothing is mapped', async () => {
    mockDb.requirementApplicability.findMany.mockClear();
    await expect(loadMappedApplicability({ organizationId: 'org_1', maps: [] })).resolves.toEqual({});
    expect(mockDb.requirementApplicability.findMany).not.toHaveBeenCalled();
  });
});
