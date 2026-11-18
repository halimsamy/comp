import { buildChecklist } from './build-checklist';
import type { ChecklistState } from './checklist-types';

const baseState = (
  overrides: Partial<ChecklistState> = {},
): ChecklistState => ({
  hasIso27001: true,
  hasPciDss: true,
  frameworkCount: 2,
  hasLogo: false,
  hasWebsite: true,
  ismsProfileCompleted: false,
  connectedCategories: [],
  hasLegacyCloudIntegration: false,
  hasDeviceSource: false,
  policies: { total: 3, published: 0, firstUnpublishedId: 'pol_1' },
  acknowledgements: { members: 0, fullySigned: 0 },
  ismsDocuments: { total: 12, approved: 0 },
  soaApproved: false,
  pciScopeTask: { id: 'tsk_scope', done: false },
  activeMembers: 1,
  risks: { total: 0, assessed: 0, withAcceptance: 0 },
  vendors: { total: 2, assessed: 2 },
  tasks: { total: 4, complete: 1 },
  evidenceSubmissions: 0,
  auditorInvited: false,
  skips: {},
  ...overrides,
});

const items = (state: ChecklistState) =>
  Object.fromEntries(
    buildChecklist(state)
      .sections.flatMap((s) => s.items)
      .map((i) => [i.id, i]),
  );

describe('buildChecklist', () => {
  it('derives done items from live state and reports progress', () => {
    const checklist = buildChecklist(baseState());
    const byId = items(baseState());

    expect(byId.frameworks.status).toBe('done');
    expect(byId.vendors_assessed.status).toBe('done');
    expect(byId.company_profile.status).toBe('todo');
    expect(byId.evidence_tasks.progress).toEqual({ done: 1, total: 4 });
    expect(checklist.total).toBe(19);
    expect(checklist.completed).toBe(2);
    expect(checklist.percent).toBe(11);
    expect(checklist.isComplete).toBe(false);
  });

  it('locks items until their dependencies are done and explains why', () => {
    const byId = items(baseState());

    expect(byId.isms_documents.status).toBe('locked');
    expect(byId.isms_documents.lockedReason).toBe(
      'Finish first: Complete the ISMS setup wizard.',
    );
    expect(byId.policies_acknowledged.status).toBe('locked');
    expect(byId.risk_acceptance.lockedReason).toBe(
      'Add risks to your register first.',
    );
    expect(byId.auditor_access.status).toBe('locked');
  });

  it('unlocks dependants once the dependency is done or skipped', () => {
    const done = items(baseState({ ismsProfileCompleted: true }));
    expect(done.isms_documents.status).toBe('todo');

    const skipped = items(
      baseState({
        skips: {
          isms_profile: {
            reason: 'Done offline',
            skippedAt: '2026-11-18T00:00:00Z',
            skippedById: null,
          },
        },
      }),
    );
    expect(skipped.isms_profile.status).toBe('skipped');
    expect(skipped.statement_of_applicability.status).toBe('todo');
  });

  it('counts skipped items as resolved but never overrides a done item', () => {
    const skip = {
      reason: 'n/a',
      skippedAt: '2026-11-18T00:00:00Z',
      skippedById: 'usr_1',
    };
    const byId = items(
      baseState({ skips: { frameworks: skip, version_control: skip } }),
    );

    expect(byId.frameworks.status).toBe('done');
    expect(byId.frameworks.skip).toBeNull();
    expect(byId.version_control.status).toBe('skipped');
    expect(
      buildChecklist(baseState({ skips: { version_control: skip } })).completed,
    ).toBe(3);
  });

  it('hides ISO-only and PCI-only steps when those frameworks are not active', () => {
    const byId = items(baseState({ hasIso27001: false, hasPciDss: false }));

    expect(byId.isms_profile).toBeUndefined();
    expect(byId.statement_of_applicability).toBeUndefined();
    expect(byId.pci_scope).toBeUndefined();
    expect(
      buildChecklist(
        baseState({ hasIso27001: false, hasPciDss: false }),
      ).sections.map((s) => s.id),
    ).not.toContain('isms');
    expect(byId.auditor_access.dependsOn).toEqual(['policies_published']);
  });

  it('deep-links to the next unpublished policy', () => {
    expect(items(baseState()).policies_published.href).toBe('/policies/pol_1');
    expect(
      items(
        baseState({
          policies: { total: 3, published: 3, firstUnpublishedId: null },
        }),
      ).policies_published,
    ).toMatchObject({ href: '/policies', status: 'done' });
  });

  it('is complete when every item is done or skipped', () => {
    const state = baseState({
      hasLogo: true,
      ismsProfileCompleted: true,
      connectedCategories: ['Identity & Access', 'Cloud', 'Development'],
      hasDeviceSource: true,
      policies: { total: 3, published: 3, firstUnpublishedId: null },
      acknowledgements: { members: 5, fullySigned: 5 },
      ismsDocuments: { total: 12, approved: 12 },
      soaApproved: true,
      pciScopeTask: { id: 'tsk_scope', done: true },
      activeMembers: 6,
      risks: { total: 2, assessed: 2, withAcceptance: 2 },
      tasks: { total: 4, complete: 4 },
      evidenceSubmissions: 1,
      auditorInvited: true,
    });
    expect(buildChecklist(state)).toMatchObject({
      completed: 19,
      total: 19,
      percent: 100,
      isComplete: true,
    });
  });
});
