import { policyAckCoverage } from './policy-ack-coverage';

const policy = (
  over: Partial<Parameters<typeof policyAckCoverage>[0]['policies'][number]>,
) => ({
  id: 'p',
  status: 'published',
  isRequiredToSign: true,
  signedBy: [],
  visibility: 'ALL',
  visibleToDepartments: [],
  ...over,
});

describe('policyAckCoverage', () => {
  const members = [
    { id: 'eng', department: 'it' },
    { id: 'ops', department: 'admin' },
  ];

  it('owes department-visibility policies only from members of those departments', () => {
    const result = policyAckCoverage({
      members,
      policies: [
        policy({ id: 'all', signedBy: ['eng'] }),
        policy({ id: 'it-only', visibility: 'DEPARTMENT', visibleToDepartments: ['it'] }),
      ],
    });
    expect(result).toMatchObject({ requiredPolicies: 2, total: 3, pending: 2 });
    expect([...result.peoplePending].sort()).toEqual(['eng', 'ops']);
    expect([...result.policiesPending].sort()).toEqual(['all', 'it-only']);
    expect(result.peopleAssigned.size).toBe(2);
  });

  it('ignores drafts and policies that do not require sign-off', () => {
    const result = policyAckCoverage({
      members,
      policies: [policy({ status: 'draft' }), policy({ isRequiredToSign: false })],
    });
    expect(result).toMatchObject({ requiredPolicies: 0, total: 0, pending: 0 });
    expect(result.peopleAssigned.size).toBe(0);
  });

  it('a member outside every department-scoped policy has nothing assigned', () => {
    const result = policyAckCoverage({
      members,
      policies: [policy({ visibility: 'DEPARTMENT', visibleToDepartments: ['it'], signedBy: ['eng'] })],
    });
    expect([...result.peopleAssigned]).toEqual(['eng']);
    expect(result.pending).toBe(0);
  });
});
