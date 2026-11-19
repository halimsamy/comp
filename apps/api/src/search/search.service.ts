import { Injectable } from '@nestjs/common';
import { db } from '@db';
import type { AuthContext } from '../auth/types';
import { loadRequirementDefinitions } from '../frameworks/frameworks-requirements.helper';
import { resolvePermissionCheck } from './search-access';
import { buildExtraIndex } from './search-extra';
import type { SearchEntry } from './search.types';

const MAX_KEYWORD_LENGTH = 200;
const MAX_TITLE_LENGTH = 90;

const entry = (
  e: Omit<SearchEntry, 'parentId' | 'keywords'> & Partial<SearchEntry>,
): SearchEntry => ({
  parentId: null,
  keywords: [],
  ...e,
});

const clip = (text: string | null | undefined) =>
  (text ?? '').slice(0, MAX_KEYWORD_LENGTH);

/** "PCI DSS Level 1" -> "PCI DSS"; other names unchanged. */
const shortFrameworkName = (name: string) =>
  name.replace(/\s+Level\s+\d+$/i, '');

/** ISO rows carry the clause title in `description` and a generic `name`; PCI rows the reverse. */
export function requirementTitle(req: {
  identifier: string | null;
  name: string;
  description: string | null;
}) {
  const description = req.description?.trim() ?? '';
  if (description && description.length <= 80 && !description.includes('\n'))
    return description;
  const id = req.identifier?.trim();
  const title =
    (id && req.name.startsWith(id)
      ? req.name.slice(id.length).trim()
      : req.name) || req.name;
  return title.length > MAX_TITLE_LENGTH
    ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : title;
}

@Injectable()
export class SearchService {
  async buildIndex({
    organizationId,
    authContext,
  }: {
    organizationId: string;
    authContext: AuthContext;
  }): Promise<SearchEntry[]> {
    const can = await resolvePermissionCheck(authContext);
    const where = { organizationId };
    const none = Promise.resolve([] as SearchEntry[]);

    const groups = await Promise.all([
      can('framework', 'read') ? this.requirements(organizationId) : none,
      can('control', 'read')
        ? db.control
            .findMany({
              where: { organizationId, archivedAt: null },
              select: { id: true, name: true, description: true },
              orderBy: { name: 'asc' },
            })
            .then((rows) =>
              rows.map((c) =>
                entry({
                  type: 'control',
                  id: c.id,
                  label: c.name,
                  description: 'Control',
                  keywords: [clip(c.description)],
                }),
              ),
            )
        : none,
      can('policy', 'read')
        ? db.policy
            .findMany({
              where: { organizationId, isArchived: false, archivedAt: null },
              select: { id: true, name: true, status: true },
              orderBy: { name: 'asc' },
            })
            .then((rows) =>
              rows.map((p) =>
                entry({
                  type: 'policy',
                  id: p.id,
                  label: p.name,
                  description: `Policy · ${p.status.replace('_', ' ')}`,
                }),
              ),
            )
        : none,
      can('task', 'read') || can('evidence', 'read')
        ? db.task
            .findMany({
              where,
              select: { id: true, title: true, status: true },
              orderBy: { title: 'asc' },
            })
            .then((rows) =>
              rows.map((t) =>
                entry({
                  type: 'task',
                  id: t.id,
                  label: t.title,
                  description: `Evidence task · ${t.status.replace('_', ' ')}`,
                  keywords: ['evidence', 'task'],
                }),
              ),
            )
        : none,
      can('risk', 'read')
        ? db.risk
            .findMany({
              where: { organizationId, status: { not: 'archived' } },
              select: { id: true, title: true, category: true },
              orderBy: { title: 'asc' },
            })
            .then((rows) =>
              rows.map((r) =>
                entry({
                  type: 'risk',
                  id: r.id,
                  label: r.title,
                  description: 'Risk',
                  keywords: [r.category.replace(/_/g, ' ')],
                }),
              ),
            )
        : none,
      can('vendor', 'read')
        ? db.vendor
            .findMany({
              where,
              select: { id: true, name: true, website: true },
              orderBy: { name: 'asc' },
            })
            .then((rows) =>
              rows.map((v) =>
                entry({
                  type: 'vendor',
                  id: v.id,
                  label: v.name,
                  description: 'Vendor',
                  keywords: v.website ? [v.website] : [],
                }),
              ),
            )
        : none,
      can('member', 'read')
        ? db.member
            .findMany({
              where: { organizationId, deactivated: false },
              select: {
                id: true,
                user: { select: { name: true, email: true } },
              },
            })
            .then((rows) =>
              rows.map((m) =>
                entry({
                  type: 'person',
                  id: m.id,
                  label: m.user.name || m.user.email,
                  description: m.user.email,
                  keywords: [m.user.email],
                }),
              ),
            )
        : none,
      can('evidence', 'read')
        ? db.ismsDocument
            .findMany({
              where,
              select: {
                type: true,
                title: true,
                requirement: { select: { identifier: true } },
              },
            })
            .then((rows) =>
              rows.map((d) =>
                entry({
                  type: 'isms_document',
                  id: d.type,
                  label: d.title,
                  description: `ISMS document${d.requirement?.identifier ? ` · clause ${d.requirement.identifier}` : ''}`,
                  keywords: [
                    'isms',
                    'iso 27001',
                    d.requirement?.identifier ?? '',
                  ],
                }),
              ),
            )
        : none,
      buildExtraIndex({ organizationId, can }),
    ]);

    return groups.flat();
  }

  private async requirements(organizationId: string): Promise<SearchEntry[]> {
    const instances = await db.frameworkInstance.findMany({
      where: { organizationId },
      select: {
        id: true,
        frameworkId: true,
        customFrameworkId: true,
        currentVersionId: true,
        framework: { select: { name: true } },
        customFramework: { select: { name: true } },
      },
    });
    const perInstance = await Promise.all(
      instances.map(async (fi) => {
        const frameworkName = shortFrameworkName(
          fi.framework?.name ?? fi.customFramework?.name ?? 'Framework',
        );
        const requirements = await loadRequirementDefinitions(fi);
        return requirements.map((req) => {
          const id = req.identifier?.trim();
          return entry({
            type: 'requirement',
            id: req.id,
            parentId: fi.id,
            label: `${frameworkName}${id ? ` ${id}` : ''} · ${requirementTitle(req)}`,
            description: frameworkName,
            keywords: [req.name, clip(req.description)],
          });
        });
      }),
    );
    return perInstance.flat();
  }
}
