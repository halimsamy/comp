import { db } from '@db';
import {
  humanize,
  personName,
  rating,
  toCsv,
  type RegisterParams,
} from './register-csv';
import { acceptanceState, latestAcceptance } from './risk-register';
import {
  TPSP_REGISTER_HEADERS,
  tpspRegisterCells,
} from '../../../vendors/tpsp/tpsp-register-columns';

/** "ISO27001 (verified); PCI_DSS" from the vendor's `complianceBadges` JSON. */
function attestations(badges: unknown): string {
  if (!Array.isArray(badges)) return '';
  return badges
    .filter(
      (b): b is { type: string; verified?: unknown } =>
        typeof b === 'object' && b !== null && typeof b.type === 'string',
    )
    .map(
      (b) =>
        `${b.type.toUpperCase()}${b.verified === true ? ' (verified)' : ''}`,
    )
    .join('; ');
}

/** Vendor / third-party service provider register (ISO 27001 A.5.19-A.5.22, PCI DSS 12.8). */
export async function buildVendorRegisterCsv({
  organizationId,
}: RegisterParams): Promise<string> {
  const vendors = await db.vendor.findMany({
    where: { organizationId },
    include: {
      assignee: { select: { user: { select: { name: true, email: true } } } },
      contacts: { select: { name: true, email: true } },
      acceptances: latestAcceptance,
    },
    orderBy: { name: 'asc' },
  });

  return toCsv({
    headers: [
      'Vendor ID',
      'Name',
      'Description',
      'Category',
      'Assessment status',
      'Website',
      'Sub-processor',
      'Owner',
      'Owner email',
      'Contacts',
      // PCI DSS 12.8.4: the TPSP's compliance status the entity monitors.
      'Compliance attestations',
      ...TPSP_REGISTER_HEADERS,
      'Inherent likelihood',
      'Inherent impact',
      'Inherent level',
      'Treatment',
      'Treatment plan',
      'Residual likelihood',
      'Residual impact',
      'Residual level',
      'Acceptance',
      'Accepted by',
      'Accepted on',
      'Created',
      'Last updated',
    ],
    rows: vendors.map((vendor) => {
      const acceptance = vendor.acceptances[0];
      return [
        vendor.id,
        vendor.name,
        vendor.description,
        humanize(vendor.category),
        humanize(vendor.status),
        vendor.website,
        vendor.isSubProcessor,
        personName(vendor.assignee?.user),
        vendor.assignee?.user.email,
        vendor.contacts.map((c) => `${c.name} <${c.email}>`).join('; '),
        attestations(vendor.complianceBadges),
        ...tpspRegisterCells(vendor),
        humanize(vendor.inherentProbability),
        humanize(vendor.inherentImpact),
        rating(vendor.inherentProbability, vendor.inherentImpact).level,
        humanize(vendor.treatmentStrategy),
        vendor.treatmentStrategyDescription,
        humanize(vendor.residualProbability),
        humanize(vendor.residualImpact),
        rating(vendor.residualProbability, vendor.residualImpact).level,
        acceptanceState({
          acceptance,
          residualLikelihood: vendor.residualProbability,
          residualImpact: vendor.residualImpact,
        }),
        acceptance?.acceptedByName,
        acceptance?.createdAt,
        vendor.createdAt,
        vendor.updatedAt,
      ];
    }),
  });
}
