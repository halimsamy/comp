import { db } from '@db';
import { z } from 'zod';
import {
  daysBefore,
  fingerprintOf,
  formatDate,
  listIssue,
  monthsBefore,
  personLabel,
  type NativeEvidenceRule,
} from '../native-evidence.types';
import { loadScopeMembers } from './people-rules';

/** A device counts only if it reported in this many days. */
export const DEVICE_SEEN_DAYS = 30;

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

function deviceRule({ requireCompliant }: { requireCompliant: boolean }): NativeEvidenceRule {
  const what = requireCompliant ? 'a compliant device' : 'a device';
  return {
    key: requireCompliant ? 'people_secure_devices' : 'people_device_list',
    module: 'People',
    title: `Every in-scope person has ${what} that checked in within ${DEVICE_SEEN_DAYS} days`,
    reference: requireCompliant
      ? 'ISO/IEC 27001:2022 A.8.1, A.8.7; PCI DSS v4.0.1 5.2.1, 8.2.8'
      : 'ISO/IEC 27001:2022 A.5.9, A.8.1; PCI DSS v4.0.1 12.5.1',
    path: '/people?tab=devices',
    async evaluate({ organizationId, now }) {
      const seenSince = daysBefore({ date: now, days: DEVICE_SEEN_DAYS });
      const [org, members] = await Promise.all([
        db.organization.findUnique({
          where: { id: organizationId },
          select: { deviceAgentStepEnabled: true },
        }),
        loadScopeMembers(organizationId),
      ]);
      const devices = await db.device.findMany({
        where: { organizationId, memberId: { in: members.map((m) => m.id) } },
        orderBy: { name: 'asc' },
      });
      const lastSeen = (d: (typeof devices)[number]) => d.lastCheckIn ?? d.updatedAt;
      const counts = (d: (typeof devices)[number]) =>
        lastSeen(d) >= seenSince && (!requireCompliant || d.isCompliant);
      const missing = members.filter((m) => !devices.some((d) => d.memberId === m.id && counts(d)));
      const enabled = !!org?.deviceAgentStepEnabled;
      const memberOf = new Map(members.map((m) => [m.id, m]));

      return {
        holds: enabled && members.length > 0 && missing.length === 0,
        summary: `${members.length - missing.length} of ${members.length} people have ${what} seen in the last ${DEVICE_SEEN_DAYS} days`,
        issues: [
          ...(enabled ? [] : ['The device agent step is turned off in People settings.']),
          ...(members.length ? [] : ['No people in compliance scope yet.']),
          ...listIssue({
            label: requireCompliant ? 'No compliant device' : 'No device reporting',
            names: missing.map((m) => m.user.name || m.user.email),
          }),
        ],
        fingerprint: fingerprintOf(
          members.map((m) => [m.id, devices.filter((d) => d.memberId === m.id && counts(d)).map((d) => d.id)]),
        ),
        sections: [
          {
            heading: requireCompliant ? 'Endpoint security' : 'Device inventory',
            intro: `Devices of active people in compliance scope as of ${formatDate(now)}. Devices not seen since ${formatDate(seenSince)} are listed but do not count.`,
            emptyText: 'No devices enrolled.',
            ...(devices.length > 0 && {
              table: {
                headers: ['Person', 'Device', 'OS', 'Serial', 'Compliant', 'Disk encryption', 'Antivirus', 'Screen lock', 'Last seen'],
                rows: devices.map((d) => {
                  const user = memberOf.get(d.memberId)?.user;
                  return [
                    user ? personLabel(user) : '—',
                    d.name,
                    `${d.platform} ${d.osVersion}`,
                    d.serialNumber ?? '—',
                    yesNo(d.isCompliant),
                    yesNo(d.diskEncryptionEnabled),
                    yesNo(d.antivirusEnabled),
                    yesNo(d.screenLockEnabled),
                    formatDate(lastSeen(d)),
                  ];
                }),
              },
            }),
          },
          ...(missing.length
            ? [{ heading: 'Gaps', bullets: missing.map((m) => personLabel(m.user)) }]
            : []),
        ],
      };
    },
  };
}

export const deviceListRule = deviceRule({ requireCompliant: false });
export const secureDevicesRule = deviceRule({ requireCompliant: true });

const chartNodes = z.array(
  z.object({ data: z.object({ name: z.string().optional(), title: z.string().nullish() }).passthrough() }).passthrough(),
);

/** ISO 27001 5.3, A.5.2: a dated org chart snapshot within 12 months. */
export const orgChartRule: NativeEvidenceRule = {
  key: 'people_org_chart',
  module: 'People',
  title: 'An org chart snapshot was saved in the last 12 months',
  reference: 'ISO/IEC 27001:2022 5.3, A.5.2',
  path: '/people?tab=chart',
  async evaluate({ organizationId, now }) {
    const snapshot = await db.organizationChartSnapshot.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    const holds = !!snapshot && snapshot.createdAt >= monthsBefore({ date: now, months: 12 });
    const parsed = chartNodes.safeParse(snapshot?.nodes ?? []);
    const nodes = parsed.success ? parsed.data : [];

    return {
      holds,
      summary: snapshot
        ? `“${snapshot.name}” saved ${formatDate(snapshot.createdAt)}`
        : 'No org chart snapshot saved',
      issues: holds
        ? []
        : [
            snapshot
              ? 'The latest snapshot is older than 12 months. Update the chart and save a new snapshot.'
              : 'Build the chart in People > Chart and click “Save snapshot”.',
          ],
      fingerprint: fingerprintOf(['chart', snapshot?.id ?? null]),
      sections: [
        {
          heading: 'Organisation chart',
          keyValues: [
            { label: 'Snapshot', value: snapshot?.name ?? '—' },
            { label: 'Saved on', value: formatDate(snapshot?.createdAt) },
            { label: 'People on chart', value: String(nodes.length) },
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
      ],
    };
  },
};
