const mockDb = {
  control: { findMany: jest.fn() },
  evidenceSubmission: { groupBy: jest.fn() },
};
jest.mock('@db', () => ({ db: mockDb }));
jest.mock('../frameworks/scoring/framework-scoring.loader', () => ({
  loadEvidenceFormContext: jest.fn().mockResolvedValue({
    freshForms: new Set(['access_request']),
    submittedForms: new Set(['access_request', 'rbac_matrix']),
    notRelevantForms: new Set(['meeting']),
  }),
}));

import { loadControlEvidence } from './controls-evidence';

const owner = { user: { name: 'Ana', email: 'ana@x.io' } };
const policy = { id: 'pol_1', name: 'Access Control Policy', status: 'published', updatedAt: new Date('2026-10-01'), assignee: owner };

describe('loadControlEvidence', () => {
  it('merges evidence across controls, once per item, with status and owner', async () => {
    mockDb.control.findMany.mockResolvedValue([
      {
        id: 'ctl_1',
        policies: [policy],
        tasks: [{ id: 'tsk_1', title: 'Quarterly access review', status: 'in_progress', updatedAt: new Date(), assignee: null }],
        frameworkPolicyLinks: [],
        frameworkTaskLinks: [],
        controlDocumentTypes: [{ formType: 'access_request' }, { formType: 'meeting' }],
        frameworkDocumentLinks: [],
        ismsDocumentLinks: [],
      },
      {
        id: 'ctl_2',
        policies: [],
        tasks: [],
        frameworkPolicyLinks: [{ policy }],
        frameworkTaskLinks: [],
        controlDocumentTypes: [],
        frameworkDocumentLinks: [{ formType: 'rbac_matrix' }],
        ismsDocumentLinks: [
          {
            ismsDocument: {
              id: 'isms_1',
              title: 'ISMS Scope',
              type: 'scope',
              status: 'draft',
              currentVersionId: null,
              updatedAt: new Date(),
              approver: null,
            },
          },
        ],
      },
    ]);
    mockDb.evidenceSubmission.groupBy.mockResolvedValue([
      { formType: 'access_request', _max: { submittedAt: new Date('2026-11-01') } },
    ]);

    const items = await loadControlEvidence({ organizationId: 'org_1', controlIds: ['ctl_1', 'ctl_2'] });

    expect(mockDb.control.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['ctl_1', 'ctl_2'] },
      organizationId: 'org_1',
    });
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(items.filter((i) => i.id === 'pol_1')).toHaveLength(1);
    expect(byId.pol_1).toMatchObject({ state: 'complete', owner: 'Ana', controlIds: ['ctl_1', 'ctl_2'] });
    expect(byId.tsk_1).toMatchObject({ kind: 'task', state: 'in_progress', owner: null });
    expect(byId.access_request).toMatchObject({ kind: 'form', status: 'fresh', state: 'complete' });
    expect(byId.meeting).toMatchObject({ status: 'not_relevant', state: 'not_relevant' });
    expect(byId.rbac_matrix).toMatchObject({ status: 'stale', state: 'in_progress' });
    expect(byId.isms_1).toMatchObject({ kind: 'isms_document', state: 'missing', type: 'scope' });
    expect(items.map((i) => i.kind)).toEqual(['policy', 'task', 'form', 'form', 'form', 'isms_document']);
  });
});
