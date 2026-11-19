import { db } from '@db';
import type { PermissionCheck } from './search-access';
import type { SearchEntry } from './search.types';

const MAX_LABEL_LENGTH = 90;

const words = (value: string) => value.replace(/_/g, ' ');

const short = (text: string) => {
  const line = text.split('\n')[0]?.trim() ?? '';
  return line.length > MAX_LABEL_LENGTH
    ? `${line.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`
    : line;
};

const entry = (
  e: Omit<SearchEntry, 'parentId' | 'keywords'> & Partial<SearchEntry>,
): SearchEntry => ({ parentId: null, keywords: [], ...e });

/**
 * Assets, vulnerabilities, findings, audits, questionnaires and access reviews,
 * each gated by the permission its own API requires.
 */
export async function buildExtraIndex({
  organizationId,
  can,
}: {
  organizationId: string;
  can: PermissionCheck;
}): Promise<SearchEntry[]> {
  const none = Promise.resolve([] as SearchEntry[]);
  const canIntegrations = can('integration', 'read');

  const groups = await Promise.all([
    canIntegrations
      ? db.asset
          .findMany({
            where: { organizationId, archivedAt: null },
            select: {
              id: true,
              name: true,
              type: true,
              environment: true,
              externalId: true,
            },
            orderBy: { name: 'asc' },
          })
          .then((rows) =>
            rows.map((a) =>
              entry({
                type: 'asset',
                id: a.id,
                label: a.name,
                description: `Asset · ${words(a.type)}`,
                keywords: [words(a.environment), a.externalId],
              }),
            ),
          )
      : none,
    canIntegrations
      ? db.integrationPlatformFinding
          .findMany({
            where: { organizationId, status: { not: 'resolved' } },
            select: {
              id: true,
              title: true,
              severity: true,
              status: true,
              cveId: true,
            },
            orderBy: { title: 'asc' },
          })
          .then((rows) =>
            rows.map((v) =>
              entry({
                type: 'vulnerability',
                id: v.id,
                label: short(v.title),
                description: `Vulnerability · ${v.severity} · ${words(v.status)}`,
                keywords: v.cveId ? [v.cveId] : [],
              }),
            ),
          )
      : none,
    can('finding', 'read')
      ? db.finding
          .findMany({
            where: { organizationId },
            select: { id: true, content: true, severity: true, status: true },
            orderBy: { createdAt: 'desc' },
          })
          .then((rows) =>
            rows.map((f) =>
              entry({
                type: 'finding',
                id: f.id,
                label: short(f.content),
                description: `Finding · ${f.severity} · ${words(f.status)}`,
                keywords: ['nonconformity', 'issue'],
              }),
            ),
          )
      : none,
    can('audit', 'read')
      ? db.auditEngagement
          .findMany({
            where: { organizationId },
            select: { id: true, title: true, status: true, firmName: true },
            orderBy: { periodStart: 'desc' },
          })
          .then((rows) =>
            rows.map((a) =>
              entry({
                type: 'audit',
                id: a.id,
                label: a.title,
                description: `Audit · ${words(a.status)}`,
                keywords: a.firmName ? ['audit', a.firmName] : ['audit'],
              }),
            ),
          )
      : none,
    can('questionnaire', 'read')
      ? db.questionnaire
          .findMany({
            where: { organizationId },
            select: { id: true, filename: true, status: true },
            orderBy: { createdAt: 'desc' },
          })
          .then((rows) =>
            rows.map((q) =>
              entry({
                type: 'questionnaire',
                id: q.id,
                label: q.filename,
                description: `Questionnaire · ${words(q.status)}`,
                keywords: ['security questionnaire'],
              }),
            ),
          )
      : none,
    can('member', 'read')
      ? db.accessReview
          .findMany({
            where: { organizationId },
            select: { id: true, name: true, status: true },
            orderBy: { dueDate: 'desc' },
          })
          .then((rows) =>
            rows.map((r) =>
              entry({
                type: 'access_review',
                id: r.id,
                label: r.name,
                description: `Access review · ${words(r.status)}`,
                keywords: ['access review', 'user access'],
              }),
            ),
          )
      : none,
  ]);
  return groups.flat();
}
