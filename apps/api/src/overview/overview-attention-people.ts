import {
  vendorNeedsAttention,
  type VendorAttentionReason,
} from '../vendors/tpsp/vendor-review-status';
import type { OverviewData } from './overview-data';
import { DAY_MS } from './overview-utils';
import {
  card,
  reasons,
  TRAINING_EXPIRY_WINDOW_DAYS,
  type AttentionCard,
} from './overview-attention-types';

/**
 * Training (#3, #189): the people-access rule (`trainingStatusForOrg`). The
 * denominator is every in-scope member, so people who never trained count.
 */
export function trainingCard({
  data,
  now,
}: {
  data: OverviewData;
  now: Date;
}): AttentionCard {
  const { inScope, trained, expired, neverTrained, members } = data.training;
  const t = now.getTime();
  const expiring = members.filter(
    (m) =>
      m.status === 'complete' &&
      m.expiresAt &&
      m.expiresAt.getTime() - t <= TRAINING_EXPIRY_WINDOW_DAYS * DAY_MS,
  ).length;
  const incomplete = Math.max(0, inScope - trained - expired - neverTrained);
  return card({
    module: 'training',
    label: 'Training',
    total: inScope,
    ok: trained - expiring,
    needsAttention: inScope - trained + expiring,
    href: '/people',
    reasons: reasons([
      ['Never trained', neverTrained],
      ['Expired', expired],
      ['In progress', incomplete],
      [`Expiring in ${TRAINING_EXPIRY_WINDOW_DAYS} days`, expiring],
    ]),
  });
}

/** People (#120): current members whose overall compliance is not complete; leavers who still owe offboarding. */
export function peopleCard({ data }: { data: OverviewData }): AttentionCard {
  const current = data.people.filter(
    (p) => !p.former && p.overall !== 'not_required',
  );
  const count = (status: string) =>
    current.filter((p) => p.overall === status).length;
  const offboarding = data.people.filter(
    (p) => p.former && p.overall !== 'complete' && p.overall !== 'not_required',
  ).length;
  const notComplete = current.filter((p) => p.overall !== 'complete').length;
  return card({
    module: 'people',
    label: 'People',
    total: current.length,
    ok: current.length - notComplete,
    needsAttention: notComplete + offboarding,
    href: '/people',
    reasons: reasons([
      ['Overdue', count('overdue')],
      ['Expired', count('expired')],
      ['Incomplete', count('incomplete')],
      ['In progress', count('in_progress')],
      ['Offboarding not finished', offboarding],
    ]),
  });
}

const VENDOR_REASONS: Array<[VendorAttentionReason, string, string]> = [
  ['not_assessed', 'Not assessed', '/vendors?status=not_assessed'],
  ['criticality_not_set', 'Criticality not set', '/vendors?criticality=unset'],
  ['review_overdue', 'Review overdue', '/vendors?attention=true'],
  ['never_reviewed_in_scope', 'Never reviewed', '/vendors?attention=true'],
  ['docs_expiring', 'Documents expired or expiring', '/vendors?attention=true'],
];

/** Vendors (#3, #121, #132): the vendors-risks rule, so the card matches the vendor list. */
export function vendorsCard({
  data,
  now,
}: {
  data: OverviewData;
  now: Date;
}): AttentionCard {
  const perVendor = data.vendors.map((vendor) =>
    vendorNeedsAttention({ vendor, now }),
  );
  const count = (reason: VendorAttentionReason) =>
    perVendor.filter((r) => r.includes(reason)).length;
  return card({
    module: 'vendors',
    label: 'Vendors',
    total: data.vendors.length,
    needsAttention: perVendor.filter((r) => r.length > 0).length,
    href: '/vendors?attention=true',
    reasons: reasons(
      VENDOR_REASONS.map(([reason, label, href]) => [label, count(reason), href]),
    ),
  });
}
