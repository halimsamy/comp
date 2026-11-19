import { db } from '@db';
import { z } from 'zod';
import { loadRoleHolders } from '../../../controls/controls-owner-suggestions';
import {
  fingerprintOf,
  formatDate,
  listIssue,
  monthsBefore,
  personLabel,
  type NativeEvidenceRule,
} from '../native-evidence.types';
import { loadScopeMembers } from './people-rules';

/** Share of active in-scope people the chart must show (#43). */
export const ORG_CHART_COVERAGE = 0.9;

const chartNodes = z.array(
  z
    .object({
      data: z
        .object({
          name: z.string().optional(),
          title: z.string().nullish(),
          memberId: z.string().nullish(),
        })
        .passthrough(),
    })
    .passthrough(),
);

/**
 * ISO 27001 5.3, A.5.2: a dated org chart snapshot within 12 months that shows
 * at least 90% of active in-scope people and every 5.3 role holder.
 */
export const orgChartRule: NativeEvidenceRule = {
  key: 'people_org_chart',
  module: 'People',
  title: `An org chart snapshot from the last 12 months shows ${ORG_CHART_COVERAGE * 100}% of people and every ISMS role holder`,
  reference: 'ISO/IEC 27001:2022 5.3, A.5.2',
  path: '/people?tab=chart',
  async evaluate({ organizationId, now }) {
    const [snapshot, members, holders] = await Promise.all([
      db.organizationChartSnapshot.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      loadScopeMembers(organizationId),
      loadRoleHolders(organizationId),
    ]);
    const parsed = chartNodes.safeParse(snapshot?.nodes ?? []);
    const nodes = parsed.success ? parsed.data : [];
    const onChart = new Set(nodes.flatMap((n) => (n.data.memberId ? [n.data.memberId] : [])));
    const missing = members.filter((m) => !onChart.has(m.id));
    const missingHolders = holders.filter((h) => !onChart.has(h.memberId));
    const shown = members.length - missing.length;
    const coverageOk = members.length > 0 && shown >= Math.ceil(members.length * ORG_CHART_COVERAGE);
    const recent = !!snapshot && snapshot.createdAt >= monthsBefore({ date: now, months: 12 });
    const holds = recent && coverageOk && missingHolders.length === 0;

    return {
      holds,
      summary: snapshot
        ? `“${snapshot.name}” saved ${formatDate(snapshot.createdAt)} shows ${shown} of ${members.length} people`
        : 'No org chart snapshot saved',
      issues: [
        ...(!snapshot ? ['Build the chart in People > Chart and click “Save snapshot”.'] : []),
        ...(snapshot && !recent
          ? ['The latest snapshot is older than 12 months. Update the chart and save a new snapshot.']
          : []),
        ...(snapshot && !coverageOk
          ? [`The chart must show at least ${ORG_CHART_COVERAGE * 100}% of active people in scope.`]
          : []),
        ...listIssue({
          label: 'ISMS role holders missing from the chart',
          names: missingHolders.map((h) => `${h.memberName} (${h.roleName})`),
        }),
        ...(snapshot ? listIssue({ label: 'Not on the chart', names: missing.map((m) => m.user.name || m.user.email) }) : []),
      ],
      fingerprint: fingerprintOf(['chart', snapshot?.id ?? null, members.map((m) => m.id), holders.map((h) => h.memberId)]),
      sections: [
        {
          heading: 'Organisation chart',
          keyValues: [
            { label: 'Snapshot', value: snapshot?.name ?? '—' },
            { label: 'Saved on', value: formatDate(snapshot?.createdAt) },
            { label: 'People on chart', value: `${shown} of ${members.length} active people in scope` },
          ],
        },
        {
          heading: 'Roles',
          emptyText: 'The snapshot has no people.',
          ...(nodes.length > 0 && {
            table: {
              headers: ['Name', 'Title'],
              rows: nodes.map((n) => [n.data.name ?? '—', n.data.title ?? '—']),
            },
          }),
        },
        ...(missing.length || missingHolders.length
          ? [
              {
                heading: 'Not on the chart',
                bullets: [
                  ...missingHolders.map((h) => `${h.memberName}: ${h.roleName}`),
                  ...missing.filter((m) => !missingHolders.some((h) => h.memberId === m.id)).map((m) => personLabel(m.user)),
                ],
              },
            ]
          : []),
      ],
    };
  },
};
