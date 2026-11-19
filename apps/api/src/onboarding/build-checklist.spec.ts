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
  idleTimeoutMinutes: null,
  controls: { total: 10, owned: 0 },
  assets: { total: 0, scoped: 0 },
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
  vendors: { total: 2, assessed: 2, classified: 2 },
  tasks: { total: 4, complete: 1, notRelevant: 0 },
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
    expect(byId.vendors_classified.status).toBe('done');
    expect(byId.control_owners.progress).toEqual({ done: 0, total: 10 });
    expect(checklist.total).toBe(23);
    expect(checklist.completed).toBe(3);
    expect(checklist.percent).toBe(13);
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
    // The auditor can be invited at any time, from the audit.
    expect(byId.auditor_access).toMatchObject({
      status: 'todo',
      dependsOn: [],
      href: '/audits',
    });
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
    ).toBe(4);
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
      tasks: { total: 4, complete: 4, notRelevant: 2 },
      evidenceSubmissions: 1,
      auditorInvited: true,
      idleTimeoutMinutes: 15,
      controls: { total: 10, owned: 10 },
      assets: { total: 3, scoped: 3 },
    });
    expect(buildChecklist(state)).toMatchObject({
      completed: 23,
      total: 23,
      percent: 100,
      isComplete: true,
    });
  });

  it('never lets the SoA, ISMS documents or PCI scope be skipped', () => {
    const skip = {
      reason: 'later',
      skippedAt: '2026-11-18T00:00:00Z',
      skippedById: null,
    };
    const byId = items(
      baseState({
        ismsProfileCompleted: true,
        skips: { statement_of_applicability: skip, pci_scope: skip },
      }),
    );
    expect(byId.statement_of_applicability).toMatchObject({
      status: 'todo',
      skip: null,
      skippable: false,
    });
    expect(byId.pci_scope.skippable).toBe(false);
    expect(byId.isms_documents.skippable).toBe(false);
    expect(byId.version_control.skippable).toBe(true);
  });

  it('deep-links connect steps to their integration category', () => {
    const byId = items(baseState());
    expect(byId.identity_provider.href).toBe(
      '/integrations?category=Identity%20%26%20Access',
    );
    expect(byId.cloud_provider.href).toBe('/integrations?category=Cloud');
    expect(byId.version_control.href).toBe('/integrations?category=Development');
  });

  it('requires an idle timeout of at most 15 minutes (PCI DSS 8.2.8)', () => {
    expect(items(baseState({ idleTimeoutMinutes: 30 })).idle_timeout.status).toBe('todo');
    expect(items(baseState({ idleTimeoutMinutes: 15 })).idle_timeout.status).toBe('done');
  });

  it('asks to scope assets and classify vendors', () => {
    const byId = items(
      baseState({
        assets: { total: 4, scoped: 1 },
        vendors: { total: 3, assessed: 0, classified: 1 },
      }),
    );
    expect(byId.assets_scoped).toMatchObject({
      status: 'todo',
      progress: { done: 1, total: 4 },
    });
    expect(byId.vendors_classified.progress).toEqual({ done: 1, total: 3 });
  });
});
