const findMany = jest.fn();
jest.mock('@db', () => ({ db: { requirementMap: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { loadMappings, RETIRED_FORM_TYPES } from './framework-evidence-mappings';

describe('loadMappings', () => {
  it('leaves out retired document forms and not-relevant tasks', async () => {
    findMany.mockResolvedValue([]);
    await loadMappings('frm_1');

    const control = findMany.mock.calls[0][0].select.control.select;
    expect(control.owner).toEqual({ select: { user: { select: { name: true, email: true } } } });
    expect(control.frameworkDocumentLinks.where).toEqual({
      frameworkInstanceId: 'frm_1',
      formType: { notIn: RETIRED_FORM_TYPES },
    });
    expect(control.frameworkTaskLinks.where).toEqual({
      frameworkInstanceId: 'frm_1',
      task: { archivedAt: null, status: { not: 'not_relevant' } },
    });
  });

  it('retires the deprecated forms only, never forms that are merely hidden', () => {
    expect(RETIRED_FORM_TYPES).toEqual(
      expect.arrayContaining([
        'network_diagram',
        'rbac_matrix',
        'account_types',
        'infrastructure_inventory',
        'board_meeting',
        'meeting',
        'it_leadership_meeting',
        'risk_committee_meeting',
      ]),
    );
    expect(RETIRED_FORM_TYPES).toHaveLength(8);
    expect(RETIRED_FORM_TYPES).not.toContain('penetration_test');
    expect(RETIRED_FORM_TYPES).not.toContain('cryptographic_inventory');
  });
});
