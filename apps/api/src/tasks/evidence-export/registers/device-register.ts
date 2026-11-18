import { db } from '@db';
import {
  humanize,
  personName,
  toCsv,
  type RegisterParams,
} from './register-csv';

/** End-user device inventory with security posture (ISO 27001 A.5.9, A.8.1; PCI DSS 5, 12.5.1). */
export async function buildDeviceRegisterCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const devices = await db.device.findMany({
    where: { organizationId },
    include: {
      member: { select: { user: { select: { name: true, email: true } } } },
    },
    orderBy: [{ memberId: 'asc' }, { name: 'asc' }],
  });

  return toCsv({
    headers: [
      'Device ID',
      'Name',
      'Hostname',
      'Owner',
      'Owner email',
      'Platform',
      'OS version',
      'Serial number',
      'Model',
      'Source',
      'Compliant',
      'Disk encryption',
      'Antivirus',
      'Password policy',
      'Screen lock',
      'Last check-in',
      'Enrolled',
    ],
    rows: devices.map((d) => [
      d.id,
      d.name,
      d.hostname,
      personName(d.member.user),
      d.member.user.email,
      humanize(d.platform),
      d.osVersion,
      d.serialNumber,
      d.hardwareModel,
      humanize(d.source),
      d.isCompliant,
      d.diskEncryptionEnabled,
      d.antivirusEnabled,
      d.passwordPolicySet,
      d.screenLockEnabled,
      d.lastCheckIn,
      d.installedAt,
    ]),
  });
}
