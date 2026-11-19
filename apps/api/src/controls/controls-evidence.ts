import { db, type EvidenceFormType } from '@db';
import { loadEvidenceFormContext } from '../frameworks/scoring/framework-scoring.loader';

export type EvidenceKind = 'policy' | 'task' | 'form' | 'isms_document';
export type EvidenceState = 'complete' | 'in_progress' | 'missing' | 'not_relevant';

export interface ControlEvidenceItem {
  kind: EvidenceKind;
  /** Policy / task / ISMS document id, or the form type for forms. */
  id: string;
  name: string;
  /** The raw status of the item (policy status, task status, ISMS status, or fresh/stale/missing). */
  status: string;
  state: EvidenceState;
  owner: string | null;
  updatedAt: Date | null;
  /** ISMS document type, for links. */
  type?: string;
  controlIds: string[];
}

const assigneeSelect = { select: { user: { select: { name: true, email: true } } } } as const;
const personName = (m: { user: { name: string | null; email: string } } | null) =>
  m ? m.user.name || m.user.email : null;

const policyState = (status: string): EvidenceState =>
  status === 'published' ? 'complete' : status === 'draft' ? 'missing' : 'in_progress';
const taskState = (status: string): EvidenceState =>
  status === 'done' ? 'complete' : status === 'not_relevant' ? 'not_relevant' : status === 'todo' ? 'missing' : 'in_progress';

/**
 * Every piece of evidence the given controls rely on (policies, tasks,
 * evidence forms and ISMS documents), merged and de-duplicated, with status,
 * owner and last update. Same freshness rule as framework scoring.
 */
export async function loadControlEvidence({
  organizationId,
  controlIds,
}: {
  organizationId: string;
  controlIds: string[];
}): Promise<ControlEvidenceItem[]> {
  const policy = { id: true, name: true, status: true, updatedAt: true, assignee: assigneeSelect } as const;
  const task = { id: true, title: true, status: true, updatedAt: true, assignee: assigneeSelect } as const;
  const [controls, formContext, latestForms] = await Promise.all([
    db.control.findMany({
      where: { id: { in: controlIds }, organizationId },
      select: {
        id: true,
        policies: { where: { archivedAt: null, isArchived: false }, select: policy },
        tasks: { where: { archivedAt: null }, select: task },
        frameworkPolicyLinks: {
          where: { policy: { archivedAt: null, isArchived: false } },
          select: { policy: { select: policy } },
        },
        frameworkTaskLinks: { where: { task: { archivedAt: null } }, select: { task: { select: task } } },
        controlDocumentTypes: { select: { formType: true } },
        frameworkDocumentLinks: { select: { formType: true } },
        ismsDocumentLinks: {
          select: {
            ismsDocument: {
              select: {
                id: true,
                title: true,
                type: true,
                status: true,
                currentVersionId: true,
                updatedAt: true,
                approver: assigneeSelect,
              },
            },
          },
        },
      },
    }),
    loadEvidenceFormContext({ organizationId }),
    db.evidenceSubmission.groupBy({
      by: ['formType'],
      where: { organizationId, status: { not: 'rejected' } },
      _max: { submittedAt: true },
    }),
  ]);
  const lastSubmitted = new Map(latestForms.map((f) => [f.formType, f._max.submittedAt]));

  const items = new Map<string, ControlEvidenceItem>();
  const add = (item: Omit<ControlEvidenceItem, 'controlIds'>, controlId: string) => {
    const key = `${item.kind}:${item.id}`;
    const existing = items.get(key);
    if (existing) {
      if (!existing.controlIds.includes(controlId)) existing.controlIds.push(controlId);
      return;
    }
    items.set(key, { ...item, controlIds: [controlId] });
  };

  for (const control of controls) {
    for (const p of [...control.policies, ...control.frameworkPolicyLinks.map((l) => l.policy)]) {
      add(
        { kind: 'policy', id: p.id, name: p.name, status: p.status, state: policyState(p.status), owner: personName(p.assignee), updatedAt: p.updatedAt },
        control.id,
      );
    }
    for (const t of [...control.tasks, ...control.frameworkTaskLinks.map((l) => l.task)]) {
      add(
        { kind: 'task', id: t.id, name: t.title, status: t.status, state: taskState(t.status), owner: personName(t.assignee), updatedAt: t.updatedAt },
        control.id,
      );
    }
    const formTypes = new Set<EvidenceFormType>([
      ...control.controlDocumentTypes.map((d) => d.formType),
      ...control.frameworkDocumentLinks.map((d) => d.formType),
    ]);
    for (const formType of formTypes) {
      const status = formContext.notRelevantForms.has(formType)
        ? 'not_relevant'
        : formContext.freshForms.has(formType)
          ? 'fresh'
          : formContext.submittedForms.has(formType)
            ? 'stale'
            : 'missing';
      const state: EvidenceState =
        status === 'fresh' ? 'complete' : status === 'stale' ? 'in_progress' : status === 'not_relevant' ? 'not_relevant' : 'missing';
      add(
        { kind: 'form', id: formType, name: formType, status, state, owner: null, updatedAt: lastSubmitted.get(formType) ?? null },
        control.id,
      );
    }
    for (const { ismsDocument: d } of control.ismsDocumentLinks) {
      const published = d.status === 'approved' || !!d.currentVersionId;
      add(
        {
          kind: 'isms_document',
          id: d.id,
          name: d.title,
          type: d.type,
          status: d.status,
          state: published ? 'complete' : d.status === 'draft' ? 'missing' : 'in_progress',
          owner: personName(d.approver),
          updatedAt: d.updatedAt,
        },
        control.id,
      );
    }
  }
  const order: Record<EvidenceKind, number> = { policy: 0, task: 1, form: 2, isms_document: 3 };
  return [...items.values()].sort(
    (a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name),
  );
}
