import { Injectable, NotFoundException } from '@nestjs/common';
import { db, EvidenceFormType } from '@db';
import {
  controlSummarySelect,
  groupRequirementsByFramework,
  toOwner,
} from './control-requirements';
import { deduplicateById } from '../utils/deduplicate';
import { buildCrosswalkCsv } from './controls-crosswalk';
import { loadEvidenceFormContext } from '../frameworks/scoring/framework-scoring.loader';

export type ControlEvidenceStatus = 'completed' | 'in_progress' | 'not_started' | 'no_evidence';

interface Tally {
  total: number;
  completed: number;
}

export function controlEvidenceStatus(tallies: Tally[]): ControlEvidenceStatus {
  const total = tallies.reduce((sum, t) => sum + t.total, 0);
  const completed = tallies.reduce((sum, t) => sum + t.completed, 0);
  if (total === 0) return 'no_evidence';
  if (completed === total) return 'completed';
  return completed === 0 ? 'not_started' : 'in_progress';
}

const overviewSelect = {
  ...controlSummarySelect,
  policies: { where: { archivedAt: null, isArchived: false }, select: { id: true, status: true } },
  tasks: { where: { archivedAt: null }, select: { id: true, status: true } },
  controlDocumentTypes: { select: { formType: true } },
  frameworkPolicyLinks: {
    where: { policy: { archivedAt: null, isArchived: false } },
    select: { policy: { select: { id: true, status: true } } },
  },
  frameworkTaskLinks: {
    where: { task: { archivedAt: null } },
    select: { task: { select: { id: true, status: true } } },
  },
  frameworkDocumentLinks: { select: { formType: true } },
  ismsDocumentLinks: {
    select: { ismsDocument: { select: { id: true, status: true, currentVersionId: true } } },
  },
} as const;

@Injectable()
export class ControlsOverviewService {
  /** Every control with its ISO / PCI requirement codes, owner and evidence status. */
  async list(organizationId: string) {
    // Same freshness rules as framework scoring: per-form cadence, rejected ignored.
    const [controls, { notRelevantForms, freshForms }] = await Promise.all([
      db.control.findMany({
        where: { organizationId, archivedAt: null },
        select: overviewSelect,
        orderBy: { name: 'asc' },
      }),
      loadEvidenceFormContext({ organizationId }),
    ]);

    const data = controls.map((control) => {
      const policies = deduplicateById([
        ...control.policies,
        ...control.frameworkPolicyLinks.map((l) => l.policy),
      ]);
      const tasks = deduplicateById([...control.tasks, ...control.frameworkTaskLinks.map((l) => l.task)]);
      const forms = [
        ...new Set<EvidenceFormType>([
          ...control.controlDocumentTypes.map((d) => d.formType),
          ...control.frameworkDocumentLinks.map((d) => d.formType),
        ]),
      ].filter((formType) => !notRelevantForms.has(formType));
      const ismsDocuments = control.ismsDocumentLinks.map((l) => l.ismsDocument);

      const evidence = {
        policies: {
          total: policies.length,
          completed: policies.filter((p) => p.status === 'published').length,
        },
        tasks: {
          total: tasks.length,
          completed: tasks.filter((t) => t.status === 'done' || t.status === 'not_relevant').length,
        },
        forms: { total: forms.length, completed: forms.filter((f) => freshForms.has(f)).length },
        ismsDocuments: {
          total: ismsDocuments.length,
          completed: ismsDocuments.filter((d) => d.status === 'approved' || d.currentVersionId)
            .length,
        },
      };

      return {
        id: control.id,
        name: control.name,
        description: control.description,
        owner: toOwner(control.owner),
        frameworks: groupRequirementsByFramework({ requirementsMapped: control.requirementsMapped }),
        evidence,
        status: controlEvidenceStatus(Object.values(evidence)),
      };
    });

    return { data, count: data.length };
  }

  async crosswalkCsv(organizationId: string): Promise<string> {
    const { data } = await this.list(organizationId);
    return buildCrosswalkCsv(data);
  }

  async setOwner({
    organizationId,
    controlId,
    ownerId,
  }: {
    organizationId: string;
    controlId: string;
    ownerId: string | null;
  }) {
    const control = await db.control.findFirst({
      where: { id: controlId, organizationId },
      select: { id: true },
    });
    if (!control) throw new NotFoundException('Control not found');

    if (ownerId) {
      const member = await db.member.findFirst({
        where: { id: ownerId, organizationId, deactivated: false },
        select: { id: true },
      });
      if (!member) throw new NotFoundException('Member not found');
    }

    const updated = await db.control.update({
      where: { id: controlId },
      data: { ownerId },
      select: { id: true, owner: controlSummarySelect.owner },
    });
    return { id: updated.id, owner: toOwner(updated.owner) };
  }
}
