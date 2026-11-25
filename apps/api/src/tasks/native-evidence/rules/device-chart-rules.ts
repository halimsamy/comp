import { db } from '@db';
import {
  daysBefore,
  fingerprintOf,
  formatDate,
  listIssue,
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
        include: { attestedBy: { select: { name: true, email: true } } },
        orderBy: { name: 'asc' },
      });
      const lastSeen = (d: (typeof devices)[number]) => d.lastCheckIn ?? d.updatedAt;
      const counts = (d: (typeof devices)[number]) =>
        lastSeen(d) >= seenSince && (!requireCompliant || d.isCompliant);
      const missing = members.filter((m) => !devices.some((d) => d.memberId === m.id && counts(d)));
      const enabled = !!org?.deviceAgentStepEnabled;
      const memberOf = new Map(members.map((m) => [m.id, m]));
      const ownerOf = (d: (typeof devices)[number]) => {
        const user = memberOf.get(d.memberId)?.user;
        return user ? personLabel(user) : '—';
      };
      const attested = devices.filter((d) => d.source === 'manual');

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
                rows: devices.map((d) => [
                  ownerOf(d),
                  d.name,
                  `${d.platform} ${d.osVersion}`,
                  d.serialNumber ?? '—',
                  yesNo(d.isCompliant),
                  yesNo(d.diskEncryptionEnabled),
                  yesNo(d.antivirusEnabled),
                  yesNo(d.screenLockEnabled),
                  formatDate(lastSeen(d)),
                ]),
              },
            }),
          },
          ...(attested.length
            ? [
                {
                  heading: 'Attested devices',
                  intro:
                    'These devices have no agent or device sync. Their checks were attested by hand when the device was added or last edited.',
                  table: {
                    headers: ['Person', 'Device', 'Attested by', 'Attested on'],
                    rows: attested.map((d) => [
                      ownerOf(d),
                      d.name,
                      d.attestedBy ? personLabel(d.attestedBy) : 'Not recorded',
                      formatDate(d.attestedAt),
                    ]),
                  },
                },
              ]
            : []),
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
